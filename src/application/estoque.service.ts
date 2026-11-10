import { Injectable } from '@nestjs/common';
import { AcaoAuditoria, TipoMovimentacao } from '../domain/enums';
import { ConflitoDeRegra, RecursoNaoEncontrado } from '../domain/erros';
import { RegistradorAuditoria } from '../infrastructure/auditoria/registrador-auditoria';
import { PrismaService, Tx } from '../infrastructure/prisma/prisma.service';
import { Paginacao, UsuarioAutenticado, garantirAcessoUnidade, montarPagina, paginar } from './comum';

export interface DadosMovimentacao {
  unidadeId: number;
  produtoId: number;
  tipo: TipoMovimentacao.ENTRADA | TipoMovimentacao.SAIDA;
  quantidade: number;
  motivo?: string;
}

@Injectable()
export class EstoqueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: RegistradorAuditoria,
  ) {}

  async consultar(u: UsuarioAutenticado, unidadeId: number, apenasAbaixoDoMinimo = false) {
    garantirAcessoUnidade(u, unidadeId);
    const unidade = await this.prisma.unidade.findUnique({ where: { id: unidadeId } });
    if (!unidade) throw new RecursoNaoEncontrado('UNIDADE_NAO_ENCONTRADA', `Unidade ${unidadeId} não encontrada.`);

    const itens = await this.prisma.estoque.findMany({
      where: { unidadeId },
      include: { produto: { select: { id: true, nome: true, categoria: true } } },
      orderBy: { produtoId: 'asc' },
    });

    const lista = itens
      .map((e) => ({
        produtoId: e.produtoId,
        produto: e.produto.nome,
        categoria: e.produto.categoria,
        quantidade: e.quantidade,
        quantidadeMinima: e.quantidadeMinima,
        abaixoDoMinimo: e.quantidade < e.quantidadeMinima,
        atualizadoEm: e.atualizadoEm,
      }))
      .filter((e) => !apenasAbaixoDoMinimo || e.abaixoDoMinimo);

    return { unidadeId, unidade: unidade.nome, itens: lista };
  }

  async movimentar(u: UsuarioAutenticado, dados: DadosMovimentacao) {
    garantirAcessoUnidade(u, dados.unidadeId);

    const [unidade, produto] = await Promise.all([
      this.prisma.unidade.findUnique({ where: { id: dados.unidadeId } }),
      this.prisma.produto.findUnique({ where: { id: dados.produtoId } }),
    ]);
    if (!unidade) throw new RecursoNaoEncontrado('UNIDADE_NAO_ENCONTRADA', `Unidade ${dados.unidadeId} não encontrada.`);
    if (!produto) throw new RecursoNaoEncontrado('PRODUTO_NAO_ENCONTRADO', `Produto ${dados.produtoId} não encontrado.`);

    return this.prisma.$transaction(async (tx) => {
      let saldo: number;
      if (dados.tipo === TipoMovimentacao.ENTRADA) {
        const e = await tx.estoque.upsert({
          where: { unidadeId_produtoId: { unidadeId: dados.unidadeId, produtoId: dados.produtoId } },
          create: { unidadeId: dados.unidadeId, produtoId: dados.produtoId, quantidade: dados.quantidade },
          update: { quantidade: { increment: dados.quantidade } },
        });
        saldo = e.quantidade;
      } else {
        saldo = await this.baixar(tx, dados.unidadeId, dados.produtoId, dados.quantidade);
      }

      const mov = await tx.movimentacaoEstoque.create({
        data: {
          unidadeId: dados.unidadeId,
          produtoId: dados.produtoId,
          tipo: dados.tipo,
          quantidade: dados.quantidade,
          saldoApos: saldo,
          motivo: dados.motivo,
          usuarioId: u.id,
        },
      });
      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.ESTOQUE_MOVIMENTADO,
          entidade: 'Estoque',
          entidadeId: `${dados.unidadeId}:${dados.produtoId}`,
          usuarioId: u.id,
          perfil: u.perfil,
          detalhes: { tipo: dados.tipo, quantidade: dados.quantidade, saldoApos: saldo },
        },
        tx,
      );

      return {
        movimentacaoId: mov.id,
        unidadeId: mov.unidadeId,
        produtoId: mov.produtoId,
        tipo: mov.tipo,
        quantidade: mov.quantidade,
        saldoAtual: saldo,
        criadoEm: mov.criadoEm,
      };
    });
  }

  async listarMovimentacoes(u: UsuarioAutenticado, unidadeId: number, filtros: Paginacao & { produtoId?: number }) {
    garantirAcessoUnidade(u, unidadeId);
    const { page, limit, skip, take } = paginar(filtros);
    const where = { unidadeId, ...(filtros.produtoId ? { produtoId: filtros.produtoId } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.movimentacaoEstoque.findMany({ where, skip, take, orderBy: { id: 'desc' } }),
      this.prisma.movimentacaoEstoque.count({ where }),
    ]);
    return montarPagina(data, total, page, limit);
  }

  // baixa condicional: só decrementa se ainda houver saldo (evita estoque negativo com pedidos simultâneos)
  async baixar(tx: Tx, unidadeId: number, produtoId: number, quantidade: number): Promise<number> {
    const r = await tx.estoque.updateMany({
      where: { unidadeId, produtoId, quantidade: { gte: quantidade } },
      data: { quantidade: { decrement: quantidade } },
    });
    const atual = await tx.estoque.findUnique({ where: { unidadeId_produtoId: { unidadeId, produtoId } } });
    if (r.count === 0) {
      throw new ConflitoDeRegra('ESTOQUE_INSUFICIENTE', 'Não há quantidade suficiente em estoque.', [
        { field: 'quantidade', issue: `Disponível: ${atual?.quantidade ?? 0}` },
      ]);
    }
    return atual!.quantidade;
  }

  async devolver(tx: Tx, unidadeId: number, produtoId: number, quantidade: number): Promise<number> {
    const e = await tx.estoque.update({
      where: { unidadeId_produtoId: { unidadeId, produtoId } },
      data: { quantidade: { increment: quantidade } },
    });
    return e.quantidade;
  }
}
