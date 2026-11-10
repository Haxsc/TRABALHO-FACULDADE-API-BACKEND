import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Perfil } from '../domain/enums';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { Paginacao, UsuarioAutenticado, montarPagina, paginar } from './comum';

export interface FiltrosAuditoria extends Paginacao {
  acao?: string;
  entidade?: string;
  entidadeId?: string;
  usuarioId?: number;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(u: UsuarioAutenticado, f: FiltrosAuditoria) {
    const { page, limit, skip, take } = paginar(f);
    const where: Prisma.LogAuditoriaWhereInput = {
      ...(f.acao ? { acao: f.acao } : {}),
      ...(f.entidade ? { entidade: f.entidade } : {}),
      ...(f.entidadeId ? { entidadeId: f.entidadeId } : {}),
      ...(f.usuarioId ? { usuarioId: f.usuarioId } : {}),
    };
    // gerente só vê a auditoria feita por pessoas da própria unidade
    if (u.perfil === Perfil.GERENTE) where.usuario = { unidadeId: u.unidadeId };

    const [logs, total] = await Promise.all([
      this.prisma.logAuditoria.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
      this.prisma.logAuditoria.count({ where }),
    ]);
    const data = logs.map((l) => ({ ...l, detalhes: l.detalhes ? JSON.parse(l.detalhes) : null }));
    return montarPagina(data, total, page, limit);
  }

  async expurgarAntigos(dias = Number(process.env.AUDIT_RETENTION_DAYS ?? 180)) {
    const limite = new Date(Date.now() - dias * 24 * 3600 * 1000);
    const r = await this.prisma.logAuditoria.deleteMany({ where: { criadoEm: { lt: limite } } });
    return { removidos: r.count, anterioresA: limite.toISOString() };
  }
}
