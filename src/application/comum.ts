import { Perfil } from '../domain/enums';
import { AcessoNegado } from '../domain/erros';

export interface UsuarioAutenticado {
  id: number;
  perfil: Perfil;
  unidadeId: number | null;
}

export interface Paginacao {
  page?: number;
  limit?: number;
}

export interface Pagina<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function paginar(p: Paginacao) {
  const page = Math.max(1, p.page ?? 1);
  const limit = Math.min(100, Math.max(1, p.limit ?? 10));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function montarPagina<T>(data: T[], total: number, page: number, limit: number): Pagina<T> {
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function ehEquipeDaLoja(u: UsuarioAutenticado): boolean {
  return [Perfil.ATENDENTE, Perfil.COZINHA, Perfil.GERENTE].includes(u.perfil);
}

// admin enxerga a rede toda; equipe da loja só a própria unidade
export function garantirAcessoUnidade(u: UsuarioAutenticado, unidadeId: number): void {
  if (u.perfil === Perfil.ADMIN) return;
  if (ehEquipeDaLoja(u) && u.unidadeId === unidadeId) return;
  throw new AcessoNegado('Você não tem acesso aos dados desta unidade.');
}

export function mascararEmail(email: string): string {
  const [nome, dominio] = email.split('@');
  if (!dominio) return '***';
  return `${nome.slice(0, 2)}***@${dominio}`;
}

export function mascararTelefone(tel: string | null): string | null {
  if (!tel) return null;
  return `*******${tel.slice(-4)}`;
}
