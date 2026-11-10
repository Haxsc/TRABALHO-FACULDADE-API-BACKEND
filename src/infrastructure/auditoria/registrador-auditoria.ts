import { Injectable, Logger } from '@nestjs/common';
import { AcaoAuditoria } from '../../domain/enums';
import { ContextoAtual } from '../contexto/contexto-requisicao';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface EventoAuditoria {
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId?: string | number | null;
  usuarioId?: number | null;
  perfil?: string | null;
  detalhes?: Record<string, unknown>;
}

// dados pessoais nunca vão pro log
const CAMPOS_PROIBIDOS = ['senha', 'senhaHash', 'email', 'telefone', 'nome', 'tokenPagamento', 'cpf'];

function limparDetalhes(obj?: Record<string, unknown>) {
  if (!obj) return undefined;
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !CAMPOS_PROIBIDOS.includes(k)));
}

@Injectable()
export class RegistradorAuditoria {
  private readonly logger = new Logger('Auditoria');

  constructor(private readonly prisma: PrismaService) {}

  async registrar(evento: EventoAuditoria, tx?: Tx): Promise<void> {
    const ctx = ContextoAtual.obter();
    const detalhes = limparDetalhes(evento.detalhes);

    await (tx ?? this.prisma).logAuditoria.create({
      data: {
        acao: evento.acao,
        entidade: evento.entidade,
        entidadeId: evento.entidadeId != null ? String(evento.entidadeId) : null,
        usuarioId: evento.usuarioId ?? null,
        perfil: evento.perfil ?? null,
        detalhes: detalhes ? JSON.stringify(detalhes) : null,
        ip: ctx?.ip ?? null,
        requestId: ctx?.requestId ?? null,
      },
    });

    this.logger.log(
      `${evento.acao} ${evento.entidade}#${evento.entidadeId ?? '-'} usuario=${evento.usuarioId ?? '-'} req=${ctx?.requestId ?? '-'}`,
    );
  }
}
