import { ValidacaoDeNegocio } from '../erros';
import { TipoPromocao } from '../enums';

export interface PromocaoAplicavel {
  codigo: string;
  tipo: string;
  valor: number;
  valorMinimoCentavos: number;
  unidadeId: number | null;
  inicio: Date;
  fim: Date;
  ativa: boolean;
}

export function calcularDescontoPromocao(
  promo: PromocaoAplicavel,
  subtotalCentavos: number,
  unidadeId: number,
  agora = new Date(),
): number {
  const invalida = (issue: string) =>
    new ValidacaoDeNegocio('PROMOCAO_INVALIDA', 'O código promocional não pode ser aplicado.', [
      { field: 'codigoPromocao', issue },
    ]);

  if (!promo.ativa || agora < promo.inicio || agora > promo.fim) {
    throw invalida('Promoção inativa ou fora da vigência');
  }
  // promoção sem unidade vale pra rede toda
  if (promo.unidadeId !== null && promo.unidadeId !== unidadeId) {
    throw invalida('Promoção não vale para esta unidade');
  }
  if (subtotalCentavos < promo.valorMinimoCentavos) {
    throw invalida(`Valor mínimo do pedido: R$ ${(promo.valorMinimoCentavos / 100).toFixed(2)}`);
  }

  const desconto =
    promo.tipo === TipoPromocao.PERCENTUAL ? Math.floor((subtotalCentavos * promo.valor) / 100) : promo.valor;
  return Math.min(desconto, subtotalCentavos);
}
