import { AcessoNegado } from '../erros';
import { CanalPedido, Perfil } from '../enums';

const CANAIS_POR_PERFIL: Record<Perfil, CanalPedido[]> = {
  [Perfil.CLIENTE]: [CanalPedido.APP, CanalPedido.WEB, CanalPedido.TOTEM, CanalPedido.PICKUP],
  [Perfil.ATENDENTE]: Object.values(CanalPedido),
  [Perfil.GERENTE]: Object.values(CanalPedido),
  [Perfil.ADMIN]: Object.values(CanalPedido),
  [Perfil.COZINHA]: [],
};

export function validarCanalParaPerfil(canal: CanalPedido, perfil: Perfil): void {
  if (!CANAIS_POR_PERFIL[perfil].includes(canal)) {
    throw new AcessoNegado(`O perfil ${perfil} não pode criar pedidos no canal ${canal}.`, 'CANAL_NAO_PERMITIDO');
  }
}
