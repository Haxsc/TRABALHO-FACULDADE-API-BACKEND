import { CanalPedido, Perfil, StatusPedido, TipoPromocao } from './enums';
import { ErroDeDominio } from './erros';
import {
  aceitaPagamento,
  validarCancelamento,
  validarTransicaoManual,
  validarTransicaoPorPagamento,
} from './pedido/maquina-status-pedido';
import { validarCanalParaPerfil } from './pedido/regras-canal';
import { agruparItens, calcularSubtotal, consolidarTotais } from './pedido/calculo-pedido';
import { calcularDescontoPromocao } from './promocao/politica-promocao';
import { calcularDescontoPorPontos, calcularPontosAcumulados } from './fidelidade/politica-fidelidade';

function capturar(fn: () => unknown): ErroDeDominio {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErroDeDominio) return e;
    throw e;
  }
  throw new Error('Era esperado um ErroDeDominio');
}

describe('Máquina de status do pedido', () => {
  it('cozinha move EM_PREPARO -> PRONTO', () => {
    expect(() => validarTransicaoManual(StatusPedido.EM_PREPARO, StatusPedido.PRONTO, Perfil.COZINHA)).not.toThrow();
  });

  it('atendente entrega pedido PRONTO', () => {
    expect(() => validarTransicaoManual(StatusPedido.PRONTO, StatusPedido.ENTREGUE, Perfil.ATENDENTE)).not.toThrow();
  });

  it('não permite pular etapas (AGUARDANDO_PAGAMENTO -> PRONTO) => 409', () => {
    const e = capturar(() =>
      validarTransicaoManual(StatusPedido.AGUARDANDO_PAGAMENTO, StatusPedido.PRONTO, Perfil.GERENTE),
    );
    expect(e.statusHttp).toBe(409);
    expect(e.codigo).toBe('TRANSICAO_INVALIDA');
  });

  it('atendente não pode marcar PRONTO (papel da cozinha) => 403', () => {
    const e = capturar(() => validarTransicaoManual(StatusPedido.EM_PREPARO, StatusPedido.PRONTO, Perfil.ATENDENTE));
    expect(e.statusHttp).toBe(403);
  });

  it('pagamento aprovado leva AGUARDANDO_PAGAMENTO -> EM_PREPARO', () => {
    expect(() =>
      validarTransicaoPorPagamento(StatusPedido.AGUARDANDO_PAGAMENTO, StatusPedido.EM_PREPARO),
    ).not.toThrow();
    expect(aceitaPagamento(StatusPedido.PAGAMENTO_RECUSADO)).toBe(true);
    expect(aceitaPagamento(StatusPedido.EM_PREPARO)).toBe(false);
  });

  it('cliente não cancela pedido já pago; gerente pode', () => {
    expect(capturar(() => validarCancelamento(StatusPedido.EM_PREPARO, Perfil.CLIENTE)).statusHttp).toBe(403);
    expect(() => validarCancelamento(StatusPedido.EM_PREPARO, Perfil.GERENTE)).not.toThrow();
    expect(capturar(() => validarCancelamento(StatusPedido.ENTREGUE, Perfil.ADMIN)).statusHttp).toBe(409);
  });
});

describe('Regras de canal (multicanalidade)', () => {
  it('cliente não pode usar o canal BALCAO', () => {
    expect(capturar(() => validarCanalParaPerfil(CanalPedido.BALCAO, Perfil.CLIENTE)).codigo).toBe(
      'CANAL_NAO_PERMITIDO',
    );
  });
  it('atendente pode registrar pedido de BALCAO', () => {
    expect(() => validarCanalParaPerfil(CanalPedido.BALCAO, Perfil.ATENDENTE)).not.toThrow();
  });
});

describe('Cálculo de valores', () => {
  it('soma subtotal e aplica descontos sem ficar negativo', () => {
    const sub = calcularSubtotal([
      { produtoId: 1, quantidade: 2, precoUnitarioCentavos: 2990 },
      { produtoId: 2, quantidade: 1, precoUnitarioCentavos: 990 },
    ]);
    expect(sub).toBe(6970);
    expect(consolidarTotais(sub, 697, 1000).totalCentavos).toBe(5273);
    expect(consolidarTotais(100, 500, 0).totalCentavos).toBe(0);
  });

  it('agrupa linhas repetidas do mesmo produto', () => {
    const m = agruparItens([
      { produtoId: 1, quantidade: 2 },
      { produtoId: 1, quantidade: 3 },
    ]);
    expect(m.get(1)).toBe(5);
  });
});

describe('Promoções', () => {
  const base = {
    codigo: 'X',
    tipo: TipoPromocao.PERCENTUAL,
    valor: 10,
    valorMinimoCentavos: 2000,
    unidadeId: null,
    inicio: new Date('2026-01-01'),
    fim: new Date('2027-12-31'),
    ativa: true,
  };
  const agora = new Date('2026-06-01');

  it('aplica percentual sobre o subtotal', () => {
    expect(calcularDescontoPromocao(base, 5000, 1, agora)).toBe(500);
  });
  it('recusa abaixo do valor mínimo (422)', () => {
    expect(capturar(() => calcularDescontoPromocao(base, 1000, 1, agora)).statusHttp).toBe(422);
  });
  it('recusa campanha de outra unidade', () => {
    expect(capturar(() => calcularDescontoPromocao({ ...base, unidadeId: 2 }, 5000, 1, agora)).codigo).toBe(
      'PROMOCAO_INVALIDA',
    );
  });
  it('valor fixo nunca excede o subtotal', () => {
    expect(
      calcularDescontoPromocao({ ...base, tipo: TipoPromocao.VALOR_FIXO, valor: 9000, valorMinimoCentavos: 0 }, 5000, 1, agora),
    ).toBe(5000);
  });
});

describe('Fidelidade', () => {
  it('acumula 1 ponto por real inteiro', () => {
    expect(calcularPontosAcumulados(5299)).toBe(52);
  });
  it('10 pontos = R$ 1,00', () => {
    expect(calcularDescontoPorPontos(50, 100, 10000, true)).toBe(500);
  });
  it('exige consentimento (409)', () => {
    expect(capturar(() => calcularDescontoPorPontos(10, 100, 10000, false)).codigo).toBe(
      'FIDELIDADE_SEM_CONSENTIMENTO',
    );
  });
  it('limita o desconto a 50% do pedido', () => {
    expect(capturar(() => calcularDescontoPorPontos(100, 1000, 1000, true)).codigo).toBe('RESGATE_ACIMA_DO_LIMITE');
  });
  it('recusa saldo insuficiente', () => {
    expect(capturar(() => calcularDescontoPorPontos(200, 100, 100000, true)).codigo).toBe(
      'SALDO_PONTOS_INSUFICIENTE',
    );
  });
});
