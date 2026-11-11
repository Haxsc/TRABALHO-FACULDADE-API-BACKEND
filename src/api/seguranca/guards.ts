import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Perfil } from '../../domain/enums';
import { AcessoNegado, NaoAutenticado } from '../../domain/erros';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CHAVE_PERFIS, CHAVE_PUBLICO } from './decorators';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICO, [ctx.getHandler(), ctx.getClass()]);
    if (publico) return true;

    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      throw new NaoAutenticado('TOKEN_AUSENTE', 'Token de acesso não informado. Envie o header Authorization: Bearer <token>.');
    }

    let payload: { sub: number };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET });
    } catch {
      throw new NaoAutenticado('TOKEN_INVALIDO', 'Token de acesso inválido ou expirado.');
    }

    // confere no banco: conta desativada/anonimizada perde o acesso na hora
    const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo) {
      throw new NaoAutenticado('TOKEN_INVALIDO', 'Token de acesso inválido ou expirado.');
    }

    req.usuario = { id: usuario.id, perfil: usuario.perfil as Perfil, unidadeId: usuario.unidadeId };
    return true;
  }
}

@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const perfis = this.reflector.getAllAndOverride<Perfil[]>(CHAVE_PERFIS, [ctx.getHandler(), ctx.getClass()]);
    if (!perfis?.length) return true;

    const usuario = ctx.switchToHttp().getRequest().usuario;
    if (!usuario || !perfis.includes(usuario.perfil)) {
      throw new AcessoNegado(`Acesso permitido apenas para: ${perfis.join(', ')}.`);
    }
    return true;
  }
}
