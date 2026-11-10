import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AcaoAuditoria, FinalidadeConsentimento, Perfil, PERFIS_DE_UNIDADE } from '../domain/enums';
import { ConflitoDeRegra, RecursoNaoEncontrado, ValidacaoDeNegocio } from '../domain/erros';
import { RegistradorAuditoria } from '../infrastructure/auditoria/registrador-auditoria';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { AuthService, VERSAO_TERMO_FIDELIDADE } from './auth.service';
import { FidelidadeService } from './fidelidade.service';
import {
  Paginacao,
  UsuarioAutenticado,
  mascararEmail,
  mascararTelefone,
  montarPagina,
  paginar,
} from './comum';

export interface DadosColaborador {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
  unidadeId?: number;
}

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly fidelidade: FidelidadeService,
    private readonly auditoria: RegistradorAuditoria,
  ) {}

  private async buscar(id: number) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw new RecursoNaoEncontrado('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.');
    return usuario;
  }

  async meuPerfil(u: UsuarioAutenticado) {
    const usuario = await this.buscar(u.id);
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone,
      perfil: usuario.perfil,
      unidadeId: usuario.unidadeId,
      consentimentoFidelidade: usuario.consentimentoFidelidade,
      criadoEm: usuario.criadoEm,
    };
  }

  async atualizarMeuPerfil(u: UsuarioAutenticado, dados: { nome?: string; telefone?: string }) {
    await this.prisma.usuario.update({
      where: { id: u.id },
      data: { nome: dados.nome?.trim(), telefone: dados.telefone },
    });
    return this.meuPerfil(u);
  }

  async alterarConsentimento(u: UsuarioAutenticado, finalidade: FinalidadeConsentimento, aceito: boolean, canal?: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.consentimento.create({
        data: { usuarioId: u.id, finalidade, aceito, versaoTermo: VERSAO_TERMO_FIDELIDADE, canal: canal ?? null },
      });
      if (finalidade === FinalidadeConsentimento.FIDELIDADE) {
        await tx.usuario.update({ where: { id: u.id }, data: { consentimentoFidelidade: aceito } });
      }
      await this.auditoria.registrar(
        {
          acao: AcaoAuditoria.CONSENTIMENTO_ALTERADO,
          entidade: 'Usuario',
          entidadeId: u.id,
          usuarioId: u.id,
          perfil: u.perfil,
          detalhes: { finalidade, aceito },
        },
        tx,
      );
    });
    return this.historicoConsentimentos(u);
  }

  async historicoConsentimentos(u: UsuarioAutenticado) {
    const lista = await this.prisma.consentimento.findMany({ where: { usuarioId: u.id }, orderBy: { id: 'desc' } });
    return lista.map((c) => ({
      finalidade: c.finalidade,
      aceito: c.aceito,
      versaoTermo: c.versaoTermo,
      canal: c.canal,
      registradoEm: c.registradoEm,
    }));
  }

  // LGPD art. 18: acesso e portabilidade dos dados do titular
  async exportarMeusDados(u: UsuarioAutenticado) {
    const perfil = await this.meuPerfil(u);
    const [consentimentos, pedidos, saldo, extrato] = await Promise.all([
      this.historicoConsentimentos(u),
      this.prisma.pedido.findMany({
        where: { clienteId: u.id },
        select: { id: true, unidadeId: true, canalPedido: true, status: true, totalCentavos: true, criadoEm: true },
        orderBy: { id: 'desc' },
      }),
      this.fidelidade.saldoDe(u.id),
      this.prisma.transacaoFidelidade.findMany({ where: { usuarioId: u.id }, orderBy: { id: 'desc' } }),
    ]);

    await this.auditoria.registrar({
      acao: AcaoAuditoria.DADOS_PESSOAIS_EXPORTADOS,
      entidade: 'Usuario',
      entidadeId: u.id,
      usuarioId: u.id,
      perfil: u.perfil,
    });

    return {
      geradoEm: new Date().toISOString(),
      dadosCadastrais: perfil,
      consentimentos,
      pedidos: pedidos.map(({ totalCentavos, ...p }) => ({ ...p, total: totalCentavos / 100 })),
      fidelidade: {
        saldoPontos: saldo,
        transacoes: extrato.map((t) => ({ tipo: t.tipo, pontos: t.pontos, descricao: t.descricao, criadoEm: t.criadoEm })),
      },
    };
  }

  // LGPD: eliminação. Os pedidos ficam (obrigação fiscal), mas sem vínculo com dado pessoal identificável.
  async anonimizarMinhaConta(u: UsuarioAutenticado) {
    const usuario = await this.buscar(u.id);
    if (usuario.anonimizadoEm) {
      throw new ConflitoDeRegra('USUARIO_JA_ANONIMIZADO', 'Esta conta já foi anonimizada.');
    }
    if (usuario.perfil !== Perfil.CLIENTE) {
      throw new ConflitoDeRegra('OPERACAO_NAO_PERMITIDA', 'Contas de colaboradores são desativadas pelo administrador.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: u.id },
        data: {
          nome: 'Titular anonimizado',
          email: `anonimizado-${u.id}-${randomBytes(4).toString('hex')}@anonimo.local`,
          telefone: null,
          senhaHash: randomBytes(32).toString('hex'),
          consentimentoFidelidade: false,
          ativo: false,
          anonimizadoEm: new Date(),
        },
      });
      await tx.refreshToken.updateMany({ where: { usuarioId: u.id, revogadoEm: null }, data: { revogadoEm: new Date() } });
      await this.auditoria.registrar(
        { acao: AcaoAuditoria.USUARIO_ANONIMIZADO, entidade: 'Usuario', entidadeId: u.id, usuarioId: u.id, perfil: u.perfil },
        tx,
      );
    });
  }

  async listar(admin: UsuarioAutenticado, filtros: Paginacao & { perfil?: Perfil }) {
    const { page, limit, skip, take } = paginar(filtros);
    const where = filtros.perfil ? { perfil: filtros.perfil } : {};
    const [usuarios, total] = await Promise.all([
      this.prisma.usuario.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.prisma.usuario.count({ where }),
    ]);

    await this.auditoria.registrar({
      acao: AcaoAuditoria.DADOS_PESSOAIS_CONSULTADOS,
      entidade: 'Usuario',
      usuarioId: admin.id,
      perfil: admin.perfil,
      detalhes: { listagem: true, quantidade: usuarios.length },
    });

    // listagem administrativa devolve contato mascarado (minimização)
    const data = usuarios.map((x) => ({
      id: x.id,
      nome: x.nome,
      email: mascararEmail(x.email),
      telefone: mascararTelefone(x.telefone),
      perfil: x.perfil,
      unidadeId: x.unidadeId,
      ativo: x.ativo,
    }));
    return montarPagina(data, total, page, limit);
  }

  async criarColaborador(admin: UsuarioAutenticado, dados: DadosColaborador) {
    if (PERFIS_DE_UNIDADE.includes(dados.perfil) && !dados.unidadeId) {
      throw new ValidacaoDeNegocio('UNIDADE_OBRIGATORIA', 'Colaboradores de loja precisam estar vinculados a uma unidade.', [
        { field: 'unidadeId', issue: 'Obrigatório para ATENDENTE, COZINHA e GERENTE' },
      ]);
    }
    if (dados.unidadeId) {
      const unidade = await this.prisma.unidade.findUnique({ where: { id: dados.unidadeId } });
      if (!unidade) throw new RecursoNaoEncontrado('UNIDADE_NAO_ENCONTRADA', 'Unidade não encontrada.');
    }
    const email = dados.email.trim().toLowerCase();
    if (await this.prisma.usuario.findUnique({ where: { email } })) {
      throw new ConflitoDeRegra('EMAIL_JA_CADASTRADO', 'Já existe uma conta com este e-mail.');
    }

    const novo = await this.prisma.usuario.create({
      data: {
        nome: dados.nome.trim(),
        email,
        senhaHash: await this.auth.hashSenha(dados.senha),
        perfil: dados.perfil,
        unidadeId: PERFIS_DE_UNIDADE.includes(dados.perfil) ? dados.unidadeId : null,
      },
    });
    await this.auditoria.registrar({
      acao: AcaoAuditoria.USUARIO_CRIADO,
      entidade: 'Usuario',
      entidadeId: novo.id,
      usuarioId: admin.id,
      perfil: admin.perfil,
      detalhes: { perfilCriado: novo.perfil, unidadeId: novo.unidadeId },
    });
    return { id: novo.id, nome: novo.nome, email: novo.email, perfil: novo.perfil, unidadeId: novo.unidadeId };
  }
}
