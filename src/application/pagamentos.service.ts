import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pagamento } from '@prisma/client';
import {
  AcaoAuditoria,
  FormaPagamento,
  Perfil,
  StatusPagamento,
  StatusPedido,
  TipoTransacaoFidelidade,
} from '../domain/enums';
import { AcessoNegado, ConflitoDeRegra, FalhaIntegracao, RecursoNaoEncontrado } from '../domain/erros';
import { calcularPontosAcumulados } from '../domain/fidelidade/politica-fidelidade';
import { centavosParaReais } from '../domain/pedido/calculo-pedido';
import { aceitaPagamento, validarTransicaoPorPagamento } from '../domain/pedido/maquina-status-pedido';
import { RegistradorAuditoria } from '../infrastructure/auditoria/registrador-auditoria';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { UsuarioAutenticado } from './comum';
import { PedidosService } from './pedidos.service';
import {
  GATEWAY_PAGAMENTO,
  GatewayIndisponivelError,
  GatewayPagamento,
  RespostaGateway,
} from './ports/gateway-pagamento';

export interface DadosPagamento {
  pedidoId: number;
  metodo: FormaPagamento;
  tokenPagamento: string;
}

export function pagamentoParaResposta(p: Pagamento, extras: Record<string, unknown> = {}) {
  return {
    pagamentoId: p.id,
    pedidoId: p.pedidoId,
    status: p.status,
    metodo: p.metodo,
    valor: centavosParaReais(p.valorCentavos),
    provedor: p.provedor,
    transacaoExternaId: p.transacaoExternaId,
    codigoRetorno: p.codigoRetorno,
    mensagem: p.mensagemRetorno,
    tentativas: p.tentativas,
    respostaGateway: p.payloadRetorno ? JSON.parse(p.payloadRetorno) : null,
    criadoEm: p.criadoEm,
    ...extras,
  };
}

@Injectable()
export class PagamentosService {
  private readonly logger = new Logger(PagamentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidos: PedidosService,
    private readonly auditoria: RegistradorAuditoria,
    @Inject(GATEWAY_PAGAMENTO) private readonly gateway: GatewayPagamento,
  ) {}

  async solicitar(u: UsuarioAutenticado, dados: DadosPagamento, idempotencyKey?: string) {
    if (u.perfil === Perfil.COZINHA) throw new AcessoNegado('A cozinha não registra pagamentos.');

    if (idempotencyKey) {
      const existente = await this.prisma.pagamento.findUnique({ where: { idempotencyKey } });
      if (existente) {
        const pedido = await this.pedidos.carregarComAcesso(u, existente.pedidoId);
        return {
          pagamento: pagamentoParaResposta(existente, { statusPedido: pedido.status }),
          reaproveitado: true,
        };
      }
    }

    const pedido = await this.pedidos.carregarComAcesso(u, dados.pedidoId);
    if (!aceitaPagamento(pedido.status)) {
      throw new ConflitoDeRegra('PEDIDO_NAO_AGUARDA_PAGAMENTO', `O pedido está com status ${pedido.status} e não aceita pagamento.`, [
        { field: 'pedidoId', issue: `Status atual: ${pedido.status}` },
      ]);
    }

    const pagamento = await this.prisma.pagamento.create({
      data: {
        pedidoId: pedido.id,
        metodo: dados.metodo,
        valorCentavos: pedido.totalCentavos,
        status: StatusPagamento.PENDENTE,
        provedor: this.gateway.nome,
        idempotencyKey: idempotencyKey ?? null,
      },
    });

    const { resposta, tentativas } = await this.cobrarComRetentativa(pagamento.id, pedido.totalCentavos, dados);

    if (!resposta) {
      const comErro = await this.prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { status: StatusPagamento.ERRO, tentativas, mensagemRetorno: 'Gateway indisponível' },
      });
      await this.auditoria.registrar({
        acao: AcaoAuditoria.PAGAMENTO_PROCESSADO,
        entidade: 'Pagamento',
        entidadeId: comErro.id,
        usuarioId: u.id,
        perfil: u.perfil,
        detalhes: { pedidoId: pedido.id, resultado: StatusPagamento.ERRO, tentativas },
      });
      throw new FalhaIntegracao(
        'GATEWAY_INDISPONIVEL',
        'O serviço de pagamento está indisponível no momento. O pedido continua aguardando pagamento; tente novamente.',
        [{ field: 'pagamentoId', issue: String(comErro.id) }],
      );
    }

    const novoStatusPedido = resposta.aprovado ? StatusPedido.EM_PREPARO : StatusPedido.PAGAMENTO_RECUSADO;
    validarTransicaoPorPagamento(pedido.status, novoStatusPedido);

    const resultado = await this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.pagamento.update({
        where: { id: pagamento.id },
        data: {
          status: resposta.aprovado ? StatusPagamento.APROVADO : StatusPagamento.RECUSADO,
          transacaoExternaId: resposta.transacaoId,
          codigoRetorno: resposta.codigo,
          mensagemRetorno: resposta.mensagem,
          payloadRetorno: JSON.stringify(resposta),
          tentativas,
        },
      });

      await tx.pedido.update({ where: { id: pedido.id }, data: { status: novoStatusPedido } });
      await tx.historicoStatusPedido.create({
        data: {
          pedidoId: pedido.id,
          statusAnterior: pedido.status,
          statusNovo: novoStatusPedido,
          usuarioId: u.id,
          motivo: `Pagamento ${atualizado.id}: ${resposta.mensagem}`,
        },
      });

      let pontosAcumulados = 0;
      if (resposta.aprovado && pedido.clienteId) {
        const cliente = await tx.usuario.findUnique({ where: { id: pedido.clienteId } });
        if (cliente?.consentimentoFidelidade) {
          pontosAcumulados = calcularPontosAcumulados(pedido.totalCentavos);
          if (pontosAcumulados > 0) {
            await tx.transacaoFidelidade.create({
              data: {
                usuarioId: cliente.id,
                pedidoId: pedido.id,
                tipo: TipoTransacaoFidelidade.ACUMULO,
                pontos: pontosAcumulados,
                descricao: `Pontos do pedido #${pedido.id}`,
              },
            });
          }
        }
      }

      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.PAGAMENTO_PROCESSADO,
          entidade: 'Pagamento',
          entidadeId: atualizado.id,
          usuarioId: u.id,
          perfil: u.perfil,
          detalhes: {
            pedidoId: pedido.id,
            resultado: atualizado.status,
            codigoRetorno: resposta.codigo,
            tentativas,
            statusPedido: novoStatusPedido,
          },
        },
        tx,
      );

      return { atualizado, pontosAcumulados };
    });

    return {
      pagamento: pagamentoParaResposta(resultado.atualizado, {
        statusPedido: novoStatusPedido,
        pontosAcumulados: resultado.pontosAcumulados,
      }),
      reaproveitado: false,
    };
  }

  private async cobrarComRetentativa(pagamentoId: number, valorCentavos: number, dados: DadosPagamento) {
    const maxTentativas = 1 + Number(process.env.PAYMENT_MAX_RETRIES ?? 2);
    let tentativas = 0;

    while (tentativas < maxTentativas) {
      tentativas++;
      try {
        const resposta: RespostaGateway = await this.gateway.cobrar({
          referencia: `pag-${pagamentoId}`,
          valorCentavos,
          metodo: dados.metodo,
          tokenPagamento: dados.tokenPagamento,
        });
        return { resposta, tentativas };
      } catch (e) {
        if (!(e instanceof GatewayIndisponivelError)) throw e;
        this.logger.warn(`pagamento ${pagamentoId}: tentativa ${tentativas}/${maxTentativas} falhou (${e.message})`);
        if (tentativas < maxTentativas) await new Promise((r) => setTimeout(r, 50 * tentativas));
      }
    }
    return { resposta: null, tentativas };
  }

  async obter(u: UsuarioAutenticado, id: number) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id } });
    if (!pagamento) throw new RecursoNaoEncontrado('PAGAMENTO_NAO_ENCONTRADO', `Pagamento ${id} não encontrado.`);
    const pedido = await this.pedidos.carregarComAcesso(u, pagamento.pedidoId);
    return pagamentoParaResposta(pagamento, { statusPedido: pedido.status });
  }

  async listarDoPedido(u: UsuarioAutenticado, pedidoId: number) {
    const pedido = await this.pedidos.carregarComAcesso(u, pedidoId);
    const pagamentos = await this.prisma.pagamento.findMany({ where: { pedidoId }, orderBy: { id: 'asc' } });
    return pagamentos.map((p) => pagamentoParaResposta(p, { statusPedido: pedido.status }));
  }
}
