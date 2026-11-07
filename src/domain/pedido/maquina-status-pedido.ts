import { ConflitoDeRegra, AcessoNegado } from '../erros';
import { Perfil, StatusPedido } from '../enums';

const TRANSICOES_MANUAIS: Record<string, { para: StatusPedido; perfis: Perfil[] }[]> = {
  [StatusPedido.EM_PREPARO]: [
    { para: StatusPedido.PRONTO, perfis: [Perfil.COZINHA, Perfil.GERENTE, Perfil.ADMIN] },
  ],
  [StatusPedido.PRONTO]: [
    { para: StatusPedido.ENTREGUE, perfis: [Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN] },
  ],
};

// essas só acontecem pelo retorno do pagamento, nunca pelo PATCH de status
const TRANSICOES_POR_PAGAMENTO: Record<string, StatusPedido[]> = {
  [StatusPedido.AGUARDANDO_PAGAMENTO]: [StatusPedido.EM_PREPARO, StatusPedido.PAGAMENTO_RECUSADO],
  [StatusPedido.PAGAMENTO_RECUSADO]: [StatusPedido.EM_PREPARO, StatusPedido.PAGAMENTO_RECUSADO],
};

export function aceitaPagamento(status: string): boolean {
  return status === StatusPedido.AGUARDANDO_PAGAMENTO || status === StatusPedido.PAGAMENTO_RECUSADO;
}

export function estaPago(status: string): boolean {
  return status === StatusPedido.EM_PREPARO || status === StatusPedido.PRONTO;
}

export function validarTransicaoManual(atual: string, novo: StatusPedido, perfil: Perfil): void {
  if (novo === StatusPedido.CANCELADO) {
    throw new ConflitoDeRegra('TRANSICAO_INVALIDA', 'Para cancelar utilize POST /pedidos/{id}/cancelar.');
  }

  const opcoes = TRANSICOES_MANUAIS[atual] ?? [];
  const transicao = opcoes.find((t) => t.para === novo);

  if (!transicao) {
    const permitidos = opcoes.map((t) => t.para);
    throw new ConflitoDeRegra('TRANSICAO_INVALIDA', `Não é possível alterar o status de ${atual} para ${novo}.`, [
      {
        field: 'status',
        issue: permitidos.length
          ? `Permitido a partir de ${atual}: ${permitidos.join(', ')}`
          : `O status ${atual} não permite alteração manual`,
      },
    ]);
  }

  if (!transicao.perfis.includes(perfil)) {
    throw new AcessoNegado(`O perfil ${perfil} não pode mover pedidos de ${atual} para ${novo}.`);
  }
}

export function validarTransicaoPorPagamento(atual: string, novo: StatusPedido): void {
  if (!(TRANSICOES_POR_PAGAMENTO[atual] ?? []).includes(novo)) {
    throw new ConflitoDeRegra('TRANSICAO_INVALIDA', `Pagamento não pode mover o pedido de ${atual} para ${novo}.`);
  }
}

export function validarCancelamento(atual: string, perfil: Perfil): void {
  if (atual === StatusPedido.ENTREGUE || atual === StatusPedido.CANCELADO) {
    throw new ConflitoDeRegra('CANCELAMENTO_NAO_PERMITIDO', `Pedido com status ${atual} não pode ser cancelado.`);
  }
  if (perfil === Perfil.COZINHA) {
    throw new AcessoNegado('A cozinha não pode cancelar pedidos.');
  }
  if (estaPago(atual) && ![Perfil.GERENTE, Perfil.ADMIN].includes(perfil)) {
    throw new AcessoNegado('Pedidos já pagos só podem ser cancelados por GERENTE ou ADMIN (gera estorno).');
  }
}
