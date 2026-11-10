import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AcaoAuditoria, CategoriaProduto, TipoPromocao } from '../domain/enums';
import { ConflitoDeRegra, RecursoNaoEncontrado, ValidacaoDeNegocio } from '../domain/erros';
import { centavosParaReais, reaisParaCentavos } from '../domain/pedido/calculo-pedido';
import { RegistradorAuditoria } from '../infrastructure/auditoria/registrador-auditoria';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { Paginacao, UsuarioAutenticado, montarPagina, paginar } from './comum';

export interface DadosUnidade {
  nome: string;
  cidade: string;
  uf: string;
  endereco: string;
}

export interface DadosProduto {
  nome: string;
  descricao?: string;
  categoria: CategoriaProduto;
  preco: number;
}

export interface DadosPromocao {
  codigo: string;
  descricao: string;
  tipo: TipoPromocao;
  valor: number;
  valorMinimo?: number;
  unidadeId?: number;
  inicio: string;
  fim: string;
}

type ProdutoDb = Prisma.ProdutoGetPayload<object>;

export function produtoParaResposta(p: ProdutoDb) {
  return {
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    categoria: p.categoria,
    preco: centavosParaReais(p.precoCentavos),
    ativo: p.ativo,
  };
}

@Injectable()
export class CatalogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: RegistradorAuditoria,
  ) {}

  async listarUnidades(p: Paginacao & { cidade?: string }) {
    const { page, limit, skip, take } = paginar(p);
    const where: Prisma.UnidadeWhereInput = { ativa: true, ...(p.cidade ? { cidade: p.cidade } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.unidade.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.unidade.count({ where }),
    ]);
    return montarPagina(data, total, page, limit);
  }

  async obterUnidade(id: number) {
    const unidade = await this.prisma.unidade.findUnique({ where: { id } });
    if (!unidade) throw new RecursoNaoEncontrado('UNIDADE_NAO_ENCONTRADA', `Unidade ${id} não encontrada.`);
    return unidade;
  }

  async criarUnidade(dados: DadosUnidade) {
    return this.prisma.unidade.create({ data: { ...dados, uf: dados.uf.toUpperCase() } });
  }

  async cardapio(unidadeId: number, categoria?: CategoriaProduto) {
    const unidade = await this.obterUnidade(unidadeId);
    if (!unidade.ativa) throw new RecursoNaoEncontrado('UNIDADE_NAO_ENCONTRADA', `Unidade ${unidadeId} não encontrada.`);

    const estoques = await this.prisma.estoque.findMany({
      where: { unidadeId, produto: { ativo: true, ...(categoria ? { categoria } : {}) } },
      include: { produto: true },
      orderBy: { produto: { categoria: 'asc' } },
    });

    return {
      unidade: { id: unidade.id, nome: unidade.nome, cidade: unidade.cidade },
      itens: estoques.map((e) => ({
        ...produtoParaResposta(e.produto),
        disponivel: e.quantidade > 0,
      })),
    };
  }

  async listarProdutos(p: Paginacao & { categoria?: CategoriaProduto; incluirInativos?: boolean }) {
    const { page, limit, skip, take } = paginar(p);
    const where: Prisma.ProdutoWhereInput = {
      ...(p.incluirInativos ? {} : { ativo: true }),
      ...(p.categoria ? { categoria: p.categoria } : {}),
    };
    const [produtos, total] = await Promise.all([
      this.prisma.produto.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.produto.count({ where }),
    ]);
    return montarPagina(produtos.map(produtoParaResposta), total, page, limit);
  }

  async obterProduto(id: number) {
    const produto = await this.prisma.produto.findUnique({ where: { id } });
    if (!produto) throw new RecursoNaoEncontrado('PRODUTO_NAO_ENCONTRADO', `Produto ${id} não encontrado.`);
    return produtoParaResposta(produto);
  }

  async criarProduto(u: UsuarioAutenticado, dados: DadosProduto) {
    if (await this.prisma.produto.findUnique({ where: { nome: dados.nome } })) {
      throw new ConflitoDeRegra('PRODUTO_DUPLICADO', 'Já existe um produto com este nome.', [
        { field: 'nome', issue: 'Nome já utilizado' },
      ]);
    }
    const produto = await this.prisma.produto.create({
      data: {
        nome: dados.nome,
        descricao: dados.descricao,
        categoria: dados.categoria,
        precoCentavos: reaisParaCentavos(dados.preco),
      },
    });
    await this.auditoria.registrar({
      acao: AcaoAuditoria.PRODUTO_ALTERADO,
      entidade: 'Produto',
      entidadeId: produto.id,
      usuarioId: u.id,
      perfil: u.perfil,
      detalhes: { operacao: 'criacao', preco: dados.preco },
    });
    return produtoParaResposta(produto);
  }

  async atualizarProduto(u: UsuarioAutenticado, id: number, dados: Partial<DadosProduto> & { ativo?: boolean }) {
    await this.obterProduto(id);
    const produto = await this.prisma.produto.update({
      where: { id },
      data: {
        nome: dados.nome,
        descricao: dados.descricao,
        categoria: dados.categoria,
        ativo: dados.ativo,
        precoCentavos: dados.preco !== undefined ? reaisParaCentavos(dados.preco) : undefined,
      },
    });
    await this.auditoria.registrar({
      acao: AcaoAuditoria.PRODUTO_ALTERADO,
      entidade: 'Produto',
      entidadeId: id,
      usuarioId: u.id,
      perfil: u.perfil,
      detalhes: { operacao: 'atualizacao', campos: Object.keys(dados) },
    });
    return produtoParaResposta(produto);
  }

  async desativarProduto(u: UsuarioAutenticado, id: number) {
    await this.atualizarProduto(u, id, { ativo: false });
  }

  async listarPromocoesVigentes(unidadeId?: number) {
    const agora = new Date();
    const promocoes = await this.prisma.promocao.findMany({
      where: {
        ativa: true,
        inicio: { lte: agora },
        fim: { gte: agora },
        ...(unidadeId ? { OR: [{ unidadeId: null }, { unidadeId }] } : {}),
      },
      orderBy: { id: 'asc' },
    });
    return promocoes.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      tipo: p.tipo,
      valor: p.tipo === TipoPromocao.PERCENTUAL ? p.valor : centavosParaReais(p.valor),
      valorMinimo: centavosParaReais(p.valorMinimoCentavos),
      unidadeId: p.unidadeId,
      inicio: p.inicio,
      fim: p.fim,
    }));
  }

  async criarPromocao(dados: DadosPromocao) {
    const inicio = new Date(dados.inicio);
    const fim = new Date(dados.fim);
    if (fim <= inicio) {
      throw new ValidacaoDeNegocio('PERIODO_INVALIDO', 'A data final deve ser posterior à inicial.', [
        { field: 'fim', issue: 'Deve ser maior que inicio' },
      ]);
    }
    if (dados.tipo === TipoPromocao.PERCENTUAL && dados.valor > 100) {
      throw new ValidacaoDeNegocio('PERCENTUAL_INVALIDO', 'Percentual deve ser no máximo 100.', [
        { field: 'valor', issue: 'Máximo 100' },
      ]);
    }
    const codigo = dados.codigo.toUpperCase();
    if (await this.prisma.promocao.findUnique({ where: { codigo } })) {
      throw new ConflitoDeRegra('PROMOCAO_DUPLICADA', 'Já existe uma promoção com este código.');
    }
    if (dados.unidadeId) await this.obterUnidade(dados.unidadeId);

    return this.prisma.promocao.create({
      data: {
        codigo,
        descricao: dados.descricao,
        tipo: dados.tipo,
        valor: dados.tipo === TipoPromocao.PERCENTUAL ? dados.valor : reaisParaCentavos(dados.valor),
        valorMinimoCentavos: reaisParaCentavos(dados.valorMinimo ?? 0),
        unidadeId: dados.unidadeId ?? null,
        inicio,
        fim,
      },
    });
  }
}
