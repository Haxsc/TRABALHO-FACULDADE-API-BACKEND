import { ValidacaoDeNegocio, ConflitoDeRegra } from '../erros';

export const PONTOS_POR_REAL = 1;
export const PONTOS_POR_BLOCO_RESGATE = 10;
export const CENTAVOS_POR_BLOCO_RESGATE = 100;
export const PERCENTUAL_MAXIMO_RESGATE = 50;

export function calcularPontosAcumulados(totalPagoCentavos: number): number {
  return Math.floor(totalPagoCentavos / 100) * PONTOS_POR_REAL;
}

export function calcularDescontoPorPontos(
  pontos: number,
  saldoAtual: number,
  baseCentavos: number,
  consentiu: boolean,
): number {
  if (!pontos || pontos <= 0) return 0;

  if (!consentiu) {
    throw new ConflitoDeRegra(
      'FIDELIDADE_SEM_CONSENTIMENTO',
      'Para usar pontos é necessário aceitar o termo do programa de fidelidade.',
    );
  }
  if (pontos % PONTOS_POR_BLOCO_RESGATE !== 0) {
    throw new ValidacaoDeNegocio('RESGATE_INVALIDO', 'Pontos devem ser resgatados em múltiplos de 10.', [
      { field: 'pontosResgatar', issue: 'Use múltiplos de 10' },
    ]);
  }
  if (pontos > saldoAtual) {
    throw new ConflitoDeRegra('SALDO_PONTOS_INSUFICIENTE', 'Saldo de pontos insuficiente.', [
      { field: 'pontosResgatar', issue: `Saldo disponível: ${saldoAtual}` },
    ]);
  }

  const desconto = (pontos / PONTOS_POR_BLOCO_RESGATE) * CENTAVOS_POR_BLOCO_RESGATE;
  const limite = Math.floor((baseCentavos * PERCENTUAL_MAXIMO_RESGATE) / 100);

  if (desconto > limite) {
    const maxPontos = Math.floor(limite / CENTAVOS_POR_BLOCO_RESGATE) * PONTOS_POR_BLOCO_RESGATE;
    throw new ValidacaoDeNegocio('RESGATE_ACIMA_DO_LIMITE', 'O desconto por pontos não pode exceder 50% do pedido.', [
      { field: 'pontosResgatar', issue: `Máximo permitido neste pedido: ${maxPontos} pontos` },
    ]);
  }
  return desconto;
}
