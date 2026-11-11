import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Perfil } from '../../domain/enums';
import { UsuarioAutenticado } from '../../application/comum';

export const CHAVE_PUBLICO = 'rota-publica';
export const CHAVE_PERFIS = 'perfis-permitidos';

export const Publico = () => SetMetadata(CHAVE_PUBLICO, true);

export const Perfis = (...perfis: Perfil[]) => SetMetadata(CHAVE_PERFIS, perfis);

export const UsuarioAtual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioAutenticado => ctx.switchToHttp().getRequest().usuario,
);
