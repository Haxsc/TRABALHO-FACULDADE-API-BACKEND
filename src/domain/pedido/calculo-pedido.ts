export interface LinhaPedido {
  produtoId: number;
  quantidade: number;
  precoUnitarioCentavos: number;
}

export interface TotaisPedido {
  subtotalCentavos: number;
  descontoPromoCentavos: number;
  descontoPontosCentavos: number;
  totalCentavos: number;
}

export function calcularSubtotal(linhas: LinhaPedido[]): number {
  return linhas.reduce((soma, l) => soma + l.quantidade * l.precoUnitarioCentavos, 0);
}

export function consolidarTotais(
  subtotalCentavos: number,
  descontoPromoCentavos: number,
  descontoPontosCentavos: number,
): TotaisPedido {
  const totalCentavos = Math.max(0, subtotalCentavos - descontoPromoCentavos - descontoPontosCentavos);
  return { subtotalCentavos, descontoPromoCentavos, descontoPontosCentavos, totalCentavos };
}

// junta linhas repetidas do mesmo produto pra validar o estoque pela quantidade total
export function agruparItens(itens: { produtoId: number; quantidade: number }[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const i of itens) mapa.set(i.produtoId, (mapa.get(i.produtoId) ?? 0) + i.quantidade);
  return mapa;
}

export const centavosParaReais = (c: number): number => Math.round(c) / 100;
export const reaisParaCentavos = (r: number): number => Math.round(r * 100);
