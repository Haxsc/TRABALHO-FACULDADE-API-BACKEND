import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  GatewayIndisponivelError,
  GatewayPagamento,
  RespostaGateway,
  SolicitacaoPagamento,
} from '../../application/ports/gateway-pagamento';

// tokens aceitos pelo mock: tok_aprovado, tok_recusado, tok_cartao_bloqueado, tok_indisponivel, tok_instavel
@Injectable()
export class MockGatewayPagamento implements GatewayPagamento {
  readonly nome = 'MOCK_GATEWAY';
  private readonly tentativasInstaveis = new Map<string, number>();

  private async esperar(): Promise<void> {
    const ms = Number(process.env.PAYMENT_MOCK_LATENCY_MS ?? 150);
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }

  private resposta(aprovado: boolean, codigo: string, mensagem: string): RespostaGateway {
    return {
      aprovado,
      transacaoId: `mock_${randomUUID()}`,
      codigo,
      mensagem,
      processadoEm: new Date().toISOString(),
    };
  }

  async cobrar(s: SolicitacaoPagamento): Promise<RespostaGateway> {
    await this.esperar();

    switch (s.tokenPagamento) {
      case 'tok_aprovado':
        return this.resposta(true, '00', 'Transação aprovada');
      case 'tok_recusado':
        return this.resposta(false, '51', 'Transação recusada: saldo insuficiente');
      case 'tok_cartao_bloqueado':
        return this.resposta(false, '62', 'Transação recusada: cartão bloqueado');
      case 'tok_indisponivel':
        throw new GatewayIndisponivelError('Timeout ao contactar o provedor de pagamento');
      case 'tok_instavel': {
        // falha na primeira tentativa e aprova na segunda
        const n = (this.tentativasInstaveis.get(s.referencia) ?? 0) + 1;
        this.tentativasInstaveis.set(s.referencia, n);
        if (n === 1) throw new GatewayIndisponivelError('Falha temporária de rede');
        return this.resposta(true, '00', 'Transação aprovada');
      }
      default:
        return this.resposta(false, '14', 'Transação recusada: token de pagamento inválido');
    }
  }

  async estornar(transacaoId: string): Promise<RespostaGateway> {
    await this.esperar();
    return { ...this.resposta(true, '00', 'Estorno realizado'), transacaoId };
  }
}
