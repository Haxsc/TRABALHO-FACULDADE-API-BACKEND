import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../infrastructure/prisma/prisma.service';
import { UsuarioAutenticado, montarPagina, paginar, Paginacao } from './comum';
import {
  CENTAVOS_POR_BLOCO_RESGATE,
  PERCENTUAL_MAXIMO_RESGATE,
  PONTOS_POR_BLOCO_RESGATE,
  PONTOS_POR_REAL,
} from '../domain/fidelidade/politica-fidelidade';

@Injectable()
export class FidelidadeService {
  constructor(private readonly prisma: PrismaService) {}

  async saldoDe(usuarioId: number, tx?: Tx): Promise<number> {
    const r = await (tx ?? this.prisma).transacaoFidelidade.aggregate({
      where: { usuarioId },
      _sum: { pontos: true },
    });
    return r._sum.pontos ?? 0;
  }

  async saldo(u: UsuarioAutenticado) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    const pontos = await this.saldoDe(u.id);
    return {
      usuarioId: u.id,
      participa: usuario.consentimentoFidelidade,
      saldoPontos: pontos,
      equivalenteEmReais: Math.floor(pontos / PONTOS_POR_BLOCO_RESGATE) * (CENTAVOS_POR_BLOCO_RESGATE / 100),
      regras: {
        acumulo: `${PONTOS_POR_REAL} ponto a cada R$ 1,00 pago`,
        resgate: `${PONTOS_POR_BLOCO_RESGATE} pontos = R$ ${(CENTAVOS_POR_BLOCO_RESGATE / 100).toFixed(2)} de desconto`,
        limite: `até ${PERCENTUAL_MAXIMO_RESGATE}% do valor do pedido`,
      },
    };
  }

  async extrato(u: UsuarioAutenticado, p: Paginacao) {
    const { page, limit, skip, take } = paginar(p);
    const where = { usuarioId: u.id };
    const [itens, total] = await Promise.all([
      this.prisma.transacaoFidelidade.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
      this.prisma.transacaoFidelidade.count({ where }),
    ]);
    const data = itens.map((t) => ({
      id: t.id,
      tipo: t.tipo,
      pontos: t.pontos,
      descricao: t.descricao,
      pedidoId: t.pedidoId,
      criadoEm: t.criadoEm,
    }));
    return montarPagina(data, total, page, limit);
  }
}
