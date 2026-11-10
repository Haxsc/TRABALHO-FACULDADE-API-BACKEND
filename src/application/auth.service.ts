import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { AcaoAuditoria, FinalidadeConsentimento, Perfil } from '../domain/enums';
import { ConflitoDeRegra, NaoAutenticado } from '../domain/erros';
import { RegistradorAuditoria } from '../infrastructure/auditoria/registrador-auditoria';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { UsuarioAutenticado } from './comum';

export const VERSAO_TERMO_FIDELIDADE = 'v1';

export interface DadosRegistro {
  nome: string;
  email: string;
  senha: string;
  telefone?: string;
  aceitaFidelidade?: boolean;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditoria: RegistradorAuditoria,
  ) {}

  private get expiracaoAcesso(): number {
    return Number(process.env.JWT_ACCESS_EXPIRES_IN ?? 3600);
  }

  async hashSenha(senha: string): Promise<string> {
    return bcrypt.hash(senha, Number(process.env.BCRYPT_ROUNDS ?? 10));
  }

  async registrar(dados: DadosRegistro) {
    const email = dados.email.trim().toLowerCase();
    const existente = await this.prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      throw new ConflitoDeRegra('EMAIL_JA_CADASTRADO', 'Já existe uma conta com este e-mail.', [
        { field: 'email', issue: 'E-mail já cadastrado' },
      ]);
    }

    const usuario = await this.prisma.$transaction(async (tx) => {
      const novo = await tx.usuario.create({
        data: {
          nome: dados.nome.trim(),
          email,
          telefone: dados.telefone ?? null,
          senhaHash: await this.hashSenha(dados.senha),
          perfil: Perfil.CLIENTE,
          consentimentoFidelidade: !!dados.aceitaFidelidade,
        },
      });
      await tx.consentimento.create({
        data: {
          usuarioId: novo.id,
          finalidade: FinalidadeConsentimento.FIDELIDADE,
          aceito: !!dados.aceitaFidelidade,
          versaoTermo: VERSAO_TERMO_FIDELIDADE,
          canal: 'CADASTRO',
        },
      });
      await this.auditoria.registrar(
        { acao: AcaoAuditoria.USUARIO_CRIADO, entidade: 'Usuario', entidadeId: novo.id, usuarioId: novo.id, perfil: novo.perfil },
        tx,
      );
      return novo;
    });

    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      consentimentoFidelidade: usuario.consentimentoFidelidade,
      criadoEm: usuario.criadoEm,
    };
  }

  async login(email: string, senha: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() } });
    const senhaOk = usuario ? await bcrypt.compare(senha, usuario.senhaHash) : false;

    if (!usuario || !senhaOk || !usuario.ativo) {
      await this.auditoria.registrar({
        acao: AcaoAuditoria.LOGIN_FALHA,
        entidade: 'Usuario',
        entidadeId: usuario?.id ?? null,
        detalhes: { motivo: !usuario ? 'usuario_inexistente' : !usuario.ativo ? 'usuario_inativo' : 'senha_incorreta' },
      });
      // mesma mensagem pros dois casos pra não revelar se o e-mail existe
      throw new NaoAutenticado('CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');
    }

    await this.auditoria.registrar({
      acao: AcaoAuditoria.LOGIN_SUCESSO,
      entidade: 'Usuario',
      entidadeId: usuario.id,
      usuarioId: usuario.id,
      perfil: usuario.perfil,
    });

    return this.emitirTokens(usuario);
  }

  async renovar(refreshToken: string) {
    const registro = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { usuario: true },
    });
    if (!registro || registro.revogadoEm || registro.expiraEm < new Date() || !registro.usuario.ativo) {
      throw new NaoAutenticado('REFRESH_TOKEN_INVALIDO', 'Refresh token inválido ou expirado.');
    }
    // rotação: o refresh usado é revogado e um novo é emitido
    await this.prisma.refreshToken.update({ where: { id: registro.id }, data: { revogadoEm: new Date() } });
    return this.emitirTokens(registro.usuario);
  }

  async logout(usuario: UsuarioAutenticado, refreshToken?: string) {
    const where = refreshToken
      ? { tokenHash: hashToken(refreshToken), usuarioId: usuario.id }
      : { usuarioId: usuario.id, revogadoEm: null };
    await this.prisma.refreshToken.updateMany({ where, data: { revogadoEm: new Date() } });
    await this.auditoria.registrar({
      acao: AcaoAuditoria.LOGOUT,
      entidade: 'Usuario',
      entidadeId: usuario.id,
      usuarioId: usuario.id,
      perfil: usuario.perfil,
    });
  }

  private async emitirTokens(usuario: { id: number; nome: string; perfil: string; unidadeId: number | null }) {
    const accessToken = await this.jwt.signAsync(
      { sub: usuario.id, perfil: usuario.perfil, unidadeId: usuario.unidadeId },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: this.expiracaoAcesso },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const dias = Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 7);
    await this.prisma.refreshToken.create({
      data: {
        usuarioId: usuario.id,
        tokenHash: hashToken(refreshToken),
        expiraEm: new Date(Date.now() + dias * 24 * 3600 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.expiracaoAcesso,
      user: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil, unidadeId: usuario.unidadeId },
    };
  }
}
