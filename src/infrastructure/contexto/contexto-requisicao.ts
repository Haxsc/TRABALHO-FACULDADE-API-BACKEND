import { AsyncLocalStorage } from 'async_hooks';

export interface ContextoRequisicao {
  requestId: string;
  ip?: string;
}

const armazenamento = new AsyncLocalStorage<ContextoRequisicao>();

export const ContextoAtual = {
  executar<T>(ctx: ContextoRequisicao, fn: () => T): T {
    return armazenamento.run(ctx, fn);
  },
  obter(): ContextoRequisicao | undefined {
    return armazenamento.getStore();
  },
};
