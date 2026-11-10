import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AcaoAuditoria,
  CanalPedido,
  FormaPagamento,
  Perfil,
  StatusPagamento,
  StatusPedido,
  TipoMovimentacao,
  TipoTransacaoFidelidade,
} from '../domain/enums';
import { AcessoNegado, ConflitoDeRegra, DetalheErro, RecursoNaoEncontrado, ValidacaoDeNegocio } from '../domain/erros';
import { calcularDescontoPorPontos } from '../domain/fidelidade/politica-fidelidade';
import {
  agruparItens,
  calcularSubtotal,
  centavosParaReais,
  consolidarTotais,
  LinhaPedido,
} from '../domain/pedido/calculo-pedido';
import { estaPago, validarCancelamento, validarTransicaoManual } from '../domain/pedido/maquina-status-pedido';
import { validarCanalParaPerfil } from '../domain/pedido/regras-canal';
import { calcularDescontoPromocao } from '../domain/promocao/politica-promocao';
import { RegistradorAuditoria } from '../infrastructure/auditoria/registrador-auditoria';
import { PrismaService, Tx } from '../infrastructure/prisma/prisma.service';
import { GATEWAY_PAGAMENTO, GatewayPagamento } from './ports/gateway-pagamento';
import {
  Paginacao,
  UsuarioAutenticado,
  ehEquipeDaLoja,
  garantirAcessoUnidade,
  montarPagina,
  paginar,
} from './comum';
import { EstoqueService } from './estoque.service';
import { FidelidadeService } from './fidelidade.service';

export interface DadosNovoPedido {
  unidadeId: number;
  canalPedido: CanalPedido;
  clienteId?: number;
  itens: { produtoId: number; quantidade: number }[];
  formaPagamento: FormaPagamento;
  codigoPromocao?: string;
  pontosResgatar?: number;
  observacao?: string;
}

export interface FiltrosPedido extends Paginacao {
  canalPedido?: CanalPedido;
  status?: StatusPedido;
  unidadeId?: number;
  dataInicio?: string;
  dataFim?: string;
}

const incluirDetalhes = {
  itens: { include: { produto: { select: { nome: true } } } },
  promocao: { select: { codigo: true } },
} satisfies Prisma.PedidoInclude;

type PedidoCompleto = Prisma.PedidoGetPayload<{ include: typeof incluirDetalhes }>;

export function pedidoParaResposta(p: PedidoCompleto) {
  return {
    pedidoId: p.id,
    unidadeId: p.unidadeId,
    clienteId: p.clienteId,
    canalPedido: p.canalPedido,
    status: p.status,
    formaPagamento: p.formaPagamento,
    itens: p.itens.map((i) => ({
      produtoId: i.produtoId,
      nome: i.produto.nome,
      quantidade: i.quantidade,
      precoUnitario: centavosParaReais(i.precoUnitarioCentavos),
      subtotal: centavosParaReais(i.subtotalCentavos),
    })),
    subtotal: centavosParaReais(p.subtotalCentavos),
    descontoPromocao: centavosParaReais(p.descontoPromoCentavos),
    descontoPontos: centavosParaReais(p.descontoPontosCentavos),
    total: centavosParaReais(p.totalCentavos),
    codigoPromocao: p.promocao?.codigo ?? null,
    pontosResgatados: p.pontosResgatados,
    observacao: p.observacao,
    createdAt: p.criadoEm,
    updatedAt: p.atualizadoEm,
  };
}

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly estoque: EstoqueService,
    private readonly fidelidade: FidelidadeService,
    private readonly auditoria: RegistradorAuditoria,
    @Inject(GATEWAY_PAGAMENTO) private readonly gateway: GatewayPagamento,
  ) {}

  async criar(u: UsuarioAutenticado, dados: DadosNovoPedido, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existente = await this.prisma.pedido.findUnique({ where: { idempotencyKey }, include: incluirDetalhes });
      if (existente) {
        if (existente.criadoPorId !== u.id) {
          throw new ConflitoDeRegra('IDEMPOTENCY_KEY_EM_USO', 'Esta Idempotency-Key já foi usada por outro usuário.');
        }
        return { pedido: pedidoParaResposta(existente), reaproveitado: true };
      }
    }

    validarCanalParaPerfil(dados.canalPedido, u.perfil);

    const unidade = await this.prisma.unidade.findUnique({ where: { id: dados.unidadeId } });
    if (!unidade || !unidade.ativa) {
      throw new RecursoNaoEncontrado('UNIDADE_NAO_ENCONTRADA', `Unidade ${dados.unidadeId} não encontrada.`, [
        { field: 'unidadeId', issue: 'Unidade inexistente ou inativa' },
      ]);
    }
    if (ehEquipeDaLoja(u)) garantirAcessoUnidade(u, dados.unidadeId);

    const clienteId = await this.resolverCliente(u, dados.clienteId);

    const pedido = await this.prisma.$transaction(async (tx) => {
      const linhas = await this.montarLinhas(tx, dados);
      const subtotal = calcularSubtotal(linhas);

      let promocaoId: number | null = null;
      let descontoPromo = 0;
      if (dados.codigoPromocao) {
        const promo = await tx.promocao.findUnique({ where: { codigo: dados.codigoPromocao.toUpperCase() } });
        if (!promo) {
          throw new ValidacaoDeNegocio('PROMOCAO_INVALIDA', 'O código promocional não pode ser aplicado.', [
            { field: 'codigoPromocao', issue: 'Código inexistente' },
          ]);
        }
        descontoPromo = calcularDescontoPromocao(promo, subtotal, dados.unidadeId);
        promocaoId = promo.id;
      }

      let descontoPontos = 0;
      const pontos = dados.pontosResgatar ?? 0;
      if (pontos > 0) {
        if (!clienteId) {
          throw new ValidacaoDeNegocio('CLIENTE_OBRIGATORIO', 'Resgate de pontos exige um cliente identificado.', [
            { field: 'clienteId', issue: 'Informe o cliente para usar pontos' },
          ]);
        }
        const cliente = await tx.usuario.findUniqueOrThrow({ where: { id: clienteId } });
        const saldo = await this.fidelidade.saldoDe(clienteId, tx);
        descontoPontos = calcularDescontoPorPontos(pontos, saldo, subtotal - descontoPromo, cliente.consentimentoFidelidade);
      }

      const totais = consolidarTotais(subtotal, descontoPromo, descontoPontos);

      const criado = await tx.pedido.create({
        data: {
          unidadeId: dados.unidadeId,
          clienteId,
          criadoPorId: u.id,
          canalPedido: dados.canalPedido,
          status: StatusPedido.AGUARDANDO_PAGAMENTO,
          formaPagamento: dados.formaPagamento,
          subtotalCentavos: totais.subtotalCentavos,
          descontoPromoCentavos: totais.descontoPromoCentavos,
          descontoPontosCentavos: totais.descontoPontosCentavos,
          totalCentavos: totais.totalCentavos,
          pontosResgatados: descontoPontos > 0 ? pontos : 0,
          promocaoId,
          observacao: dados.observacao,
          idempotencyKey: idempotencyKey ?? null,
          itens: {
            create: linhas.map((l) => ({
              produtoId: l.produtoId,
              quantidade: l.quantidade,
              precoUnitarioCentavos: l.precoUnitarioCentavos,
              subtotalCentavos: l.quantidade * l.precoUnitarioCentavos,
            })),
          },
          historico: {
            create: { statusAnterior: null, statusNovo: StatusPedido.AGUARDANDO_PAGAMENTO, usuarioId: u.id },
          },
        },
      });

      // reserva o estoque já na criação; se o pedido for cancelado, volta
      for (const l of linhas) {
        const saldo = await this.estoque.baixar(tx, dados.unidadeId, l.produtoId, l.quantidade);
        await tx.movimentacaoEstoque.create({
          data: {
            unidadeId: dados.unidadeId,
            produtoId: l.produtoId,
            tipo: TipoMovimentacao.VENDA,
            quantidade: l.quantidade,
            saldoApos: saldo,
            pedidoId: criado.id,
            usuarioId: u.id,
          },
        });
      }

      if (descontoPontos > 0 && clienteId) {
        await tx.transacaoFidelidade.create({
          data: {
            usuarioId: clienteId,
            pedidoId: criado.id,
            tipo: TipoTransacaoFidelidade.RESGATE,
            pontos: -pontos,
            descricao: `Resgate no pedido #${criado.id}`,
          },
        });
      }

      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.PEDIDO_CRIADO,
          entidade: 'Pedido',
          entidadeId: criado.id,
          usuarioId: u.id,
          perfil: u.perfil,
          detalhes: {
            canalPedido: dados.canalPedido,
            unidadeId: dados.unidadeId,
            totalCentavos: totais.totalCentavos,
            itens: linhas.length,
          },
        },
        tx,
      );

      return tx.pedido.findUniqueOrThrow({ where: { id: criado.id }, include: incluirDetalhes });
    });

    return { pedido: pedidoParaResposta(pedido), reaproveitado: false };
  }

  private async resolverCliente(u: UsuarioAutenticado, clienteId?: number): Promise<number | null> {
    if (u.perfil === Perfil.CLIENTE) {
      if (clienteId && clienteId !== u.id) {
        throw new AcessoNegado('Cliente só pode criar pedidos para si mesmo.');
      }
      return u.id;
    }
    if (!clienteId) return null;

    const cliente = await this.prisma.usuario.findUnique({ where: { id: clienteId } });
    if (!cliente || cliente.perfil !== Perfil.CLIENTE || !cliente.ativo) {
      throw new RecursoNaoEncontrado('CLIENTE_NAO_ENCONTRADO', `Cliente ${clienteId} não encontrado.`, [
        { field: 'clienteId', issue: 'Cliente inexistente ou inativo' },
      ]);
    }
    return cliente.id;
  }

  private async montarLinhas(tx: Tx, dados: DadosNovoPedido): Promise<LinhaPedido[]> {
    const agrupado = agruparItens(dados.itens);
    const ids = [...agrupado.keys()];

    const produtos = await tx.produto.findMany({ where: { id: { in: ids } } });
    const estoques = await tx.estoque.findMany({ where: { unidadeId: dados.unidadeId, produtoId: { in: ids } } });

    const naoEncontrados: DetalheErro[] = [];
    const semEstoque: DetalheErro[] = [];

    dados.itens.forEach((item, idx) => {
      const produto = produtos.find((p) => p.id === item.produtoId);
      const estoque = estoques.find((e) => e.produtoId === item.produtoId);
      if (!produto || !produto.ativo) {
        naoEncontrados.push({ field: `itens[${idx}].produtoId`, issue: `Produto ${item.produtoId} não existe` });
      } else if (!estoque) {
        naoEncontrados.push({
          field: `itens[${idx}].produtoId`,
          issue: `Produto ${item.produtoId} não faz parte do cardápio da unidade ${dados.unidadeId}`,
        });
      } else if (estoque.quantidade < agrupado.get(item.produtoId)!) {
        semEstoque.push({ field: `itens[${idx}].quantidade`, issue: `Disponível: ${estoque.quantidade}` });
      }
    });

    if (naoEncontrados.length) {
      throw new RecursoNaoEncontrado('PRODUTO_NAO_ENCONTRADO', 'Um ou mais produtos não foram encontrados na unidade.', naoEncontrados);
    }
    if (semEstoque.length) {
      throw new ConflitoDeRegra('ESTOQUE_INSUFICIENTE', 'Não há quantidade suficiente para um ou mais itens.', semEstoque);
    }

    return ids.map((id) => ({
      produtoId: id,
      quantidade: agrupado.get(id)!,
      precoUnitarioCentavos: produtos.find((p) => p.id === id)!.precoCentavos,
    }));
  }

  async listar(u: UsuarioAutenticado, f: FiltrosPedido) {
    const { page, limit, skip, take } = paginar(f);
    const where: Prisma.PedidoWhereInput = {};

    if (ehEquipeDaLoja(u)) {
      if (f.unidadeId) garantirAcessoUnidade(u, f.unidadeId);
      where.unidadeId = u.unidadeId!;
    } else if (f.unidadeId) {
      where.unidadeId = f.unidadeId;
    }
    if (u.perfil === Perfil.CLIENTE) where.clienteId = u.id;
    if (f.canalPedido) where.canalPedido = f.canalPedido;
    if (f.status) where.status = f.status;
    if (f.dataInicio || f.dataFim) {
      where.criadoEm = {
        ...(f.dataInicio ? { gte: new Date(f.dataInicio) } : {}),
        ...(f.dataFim ? { lte: new Date(f.dataFim) } : {}),
      };
    }

    const [pedidos, total] = await Promise.all([
      this.prisma.pedido.findMany({ where, include: incluirDetalhes, orderBy: { id: 'desc' }, skip, take }),
      this.prisma.pedido.count({ where }),
    ]);
    return montarPagina(pedidos.map(pedidoParaResposta), total, page, limit);
  }

  async resumoPorCanal(u: UsuarioAutenticado, unidadeId?: number) {
    let filtroUnidade = unidadeId;
    if (u.perfil !== Perfil.ADMIN) {
      filtroUnidade = u.unidadeId!;
      if (unidadeId && unidadeId !== u.unidadeId) garantirAcessoUnidade(u, unidadeId);
    }

    const grupos = await this.prisma.pedido.groupBy({
      by: ['canalPedido'],
      where: { status: { not: StatusPedido.CANCELADO }, ...(filtroUnidade ? { unidadeId: filtroUnidade } : {}) },
      _count: { _all: true },
      _sum: { totalCentavos: true },
    });

    return {
      unidadeId: filtroUnidade ?? null,
      canais: Object.values(CanalPedido).map((canal) => {
        const g = grupos.find((x) => x.canalPedido === canal);
        return {
          canalPedido: canal,
          quantidadePedidos: g?._count._all ?? 0,
          valorTotal: centavosParaReais(g?._sum.totalCentavos ?? 0),
        };
      }),
    };
  }

  async carregarComAcesso(u: UsuarioAutenticado, id: number) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id }, include: incluirDetalhes });
    if (!pedido) throw new RecursoNaoEncontrado('PEDIDO_NAO_ENCONTRADO', `Pedido ${id} não encontrado.`);

    if (u.perfil === Perfil.CLIENTE && pedido.clienteId !== u.id) {
      // não revela que o pedido de outra pessoa existe
      throw new RecursoNaoEncontrado('PEDIDO_NAO_ENCONTRADO', `Pedido ${id} não encontrado.`);
    }
    if (u.perfil !== Perfil.CLIENTE) garantirAcessoUnidade(u, pedido.unidadeId);
    return pedido;
  }

  async obter(u: UsuarioAutenticado, id: number) {
    const pedido = await this.carregarComAcesso(u, id);
    const historico = await this.prisma.historicoStatusPedido.findMany({ where: { pedidoId: id }, orderBy: { id: 'asc' } });
    return {
      ...pedidoParaResposta(pedido),
      historicoStatus: historico.map((h) => ({
        de: h.statusAnterior,
        para: h.statusNovo,
        usuarioId: h.usuarioId,
        motivo: h.motivo,
        em: h.criadoEm,
      })),
    };
  }

  async atualizarStatus(u: UsuarioAutenticado, id: number, novo: StatusPedido) {
    if (u.perfil === Perfil.CLIENTE) throw new AcessoNegado('Clientes não alteram o status do pedido.');
    const pedido = await this.carregarComAcesso(u, id);
    validarTransicaoManual(pedido.status, novo, u.perfil);

    await this.prisma.$transaction(async (tx) => {
      await tx.pedido.update({ where: { id }, data: { status: novo } });
      await tx.historicoStatusPedido.create({
        data: { pedidoId: id, statusAnterior: pedido.status, statusNovo: novo, usuarioId: u.id },
      });
      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.PEDIDO_STATUS_ALTERADO,
          entidade: 'Pedido',
          entidadeId: id,
          usuarioId: u.id,
          perfil: u.perfil,
          detalhes: { de: pedido.status, para: novo, canalPedido: pedido.canalPedido },
        },
        tx,
      );
    });
    return this.obter(u, id);
  }

  async cancelar(u: UsuarioAutenticado, id: number, motivo?: string) {
    const pedido = await this.carregarComAcesso(u, id);
    validarCancelamento(pedido.status, u.perfil);

    let pagamentoEstornado: { id: number; transacaoExternaId: string | null; valorCentavos: number } | null = null;
    if (estaPago(pedido.status)) {
      const aprovado = await this.prisma.pagamento.findFirst({
        where: { pedidoId: id, status: StatusPagamento.APROVADO },
      });
      if (aprovado) {
        await this.gateway.estornar(aprovado.transacaoExternaId ?? '', aprovado.valorCentavos);
        pagamentoEstornado = aprovado;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pedido.update({ where: { id }, data: { status: StatusPedido.CANCELADO } });
      await tx.historicoStatusPedido.create({
        data: { pedidoId: id, statusAnterior: pedido.status, statusNovo: StatusPedido.CANCELADO, usuarioId: u.id, motivo },
      });

      for (const item of pedido.itens) {
        const saldo = await this.estoque.devolver(tx, pedido.unidadeId, item.produtoId, item.quantidade);
        await tx.movimentacaoEstoque.create({
          data: {
            unidadeId: pedido.unidadeId,
            produtoId: item.produtoId,
            tipo: TipoMovimentacao.ESTORNO,
            quantidade: item.quantidade,
            saldoApos: saldo,
            pedidoId: id,
            usuarioId: u.id,
            motivo: 'Cancelamento do pedido',
          },
        });
      }

      if (pedido.clienteId) {
        const transacoes = await tx.transacaoFidelidade.findMany({ where: { pedidoId: id } });
        const pontosLiquidos = transacoes.reduce((s, t) => s + t.pontos, 0);
        if (pontosLiquidos !== 0) {
          await tx.transacaoFidelidade.create({
            data: {
              usuarioId: pedido.clienteId,
              pedidoId: id,
              tipo: TipoTransacaoFidelidade.ESTORNO,
              pontos: -pontosLiquidos,
              descricao: `Estorno de pontos do pedido #${id} cancelado`,
            },
          });
        }
      }

      if (pagamentoEstornado) {
        await tx.pagamento.update({ where: { id: pagamentoEstornado.id }, data: { status: StatusPagamento.ESTORNADO } });
        await this.auditoria.registrar(
          {
            acao: AcaoAuditoria.PAGAMENTO_ESTORNADO,
            entidade: 'Pagamento',
            entidadeId: pagamentoEstornado.id,
            usuarioId: u.id,
            perfil: u.perfil,
            detalhes: { pedidoId: id, valorCentavos: pagamentoEstornado.valorCentavos },
          },
          tx,
        );
      }

      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.PEDIDO_CANCELADO,
          entidade: 'Pedido',
          entidadeId: id,
          usuarioId: u.id,
          perfil: u.perfil,
          detalhes: { statusAnterior: pedido.status, motivo: motivo ?? null, estorno: !!pagamentoEstornado },
        },
        tx,
      );
    });

    return this.obter(u, id);
  }
}
