export interface SolicitacaoPagamento {
  referencia: string;
  valorCentavos: number;
  metodo: string;
  tokenPagamento: string;
}

export interface RespostaGateway {
  aprovado: boolean;
  transacaoId: string;
  codigo: string;
  mensagem: string;
  processadoEm: string;
}

export class GatewayIndisponivelError extends Error {
  constructor(mensagem = 'Gateway de pagamento indisponível') {
    super(mensagem);
  }
}

export interface GatewayPagamento {
  readonly nome: string;
  cobrar(solicitacao: SolicitacaoPagamento): Promise<RespostaGateway>;
  estornar(transacaoId: string, valorCentavos: number): Promise<RespostaGateway>;
}

export const GATEWAY_PAGAMENTO = Symbol('GATEWAY_PAGAMENTO');
