import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SENHA_PADRAO = 'Senha@123';

async function main() {
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 10);
  const senhaHash = await bcrypt.hash(SENHA_PADRAO, rounds);

  const matriz = await prisma.unidade.create({
    data: { nome: 'Matriz Centro', cidade: 'Curitiba', uf: 'PR', endereco: 'Rua XV de Novembro, 1000', ehMatriz: true },
  });
  const batel = await prisma.unidade.create({
    data: { nome: 'Unidade Batel', cidade: 'Curitiba', uf: 'PR', endereco: 'Av. do Batel, 1500' },
  });
  const londrina = await prisma.unidade.create({
    data: { nome: 'Unidade Londrina', cidade: 'Londrina', uf: 'PR', endereco: 'Av. Higienópolis, 200' },
  });

  const catalogo = [
    { nome: 'X-Burger', categoria: 'LANCHE', precoCentavos: 2590, descricao: 'Pão, hambúrguer 150g, queijo e molho da casa' },
    { nome: 'X-Salada', categoria: 'LANCHE', precoCentavos: 2790, descricao: 'X-Burger com alface e tomate' },
    { nome: 'X-Bacon', categoria: 'LANCHE', precoCentavos: 3190, descricao: 'Hambúrguer 150g, queijo e bacon crocante' },
    { nome: 'Veggie Burger', categoria: 'LANCHE', precoCentavos: 2990, descricao: 'Hambúrguer de grão-de-bico' },
    { nome: 'Batata Frita M', categoria: 'ACOMPANHAMENTO', precoCentavos: 1290 },
    { nome: 'Onion Rings', categoria: 'ACOMPANHAMENTO', precoCentavos: 1490 },
    { nome: 'Refrigerante Lata', categoria: 'BEBIDA', precoCentavos: 690 },
    { nome: 'Suco Natural 500ml', categoria: 'BEBIDA', precoCentavos: 990 },
    { nome: 'Milkshake Chocolate', categoria: 'SOBREMESA', precoCentavos: 1890 },
    { nome: 'Combo X-Burger', categoria: 'COMBO', precoCentavos: 3990, descricao: 'X-Burger + Batata M + Refrigerante' },
  ];
  // sequencial pra manter os ids na ordem da lista (a coleção do postman usa esses ids)
  const produtos = [];
  for (const p of catalogo) produtos.push(await prisma.produto.create({ data: p }));

  const [xBurger, xSalada, xBacon, veggie, batata, onion, refri, suco, milkshake, combo] = produtos;

  // cada unidade tem seu próprio estoque; o que não está aqui não aparece no cardápio da unidade
  const estoques: [number, number, number][] = [
    [matriz.id, xBurger.id, 50], [matriz.id, xSalada.id, 40], [matriz.id, xBacon.id, 30],
    [matriz.id, veggie.id, 15], [matriz.id, batata.id, 80], [matriz.id, onion.id, 25],
    [matriz.id, refri.id, 120], [matriz.id, suco.id, 30], [matriz.id, milkshake.id, 2], [matriz.id, combo.id, 40],
    [batel.id, xBurger.id, 30], [batel.id, xSalada.id, 20], [batel.id, batata.id, 50],
    [batel.id, refri.id, 60], [batel.id, milkshake.id, 10],
    [londrina.id, xBurger.id, 25], [londrina.id, xBacon.id, 0], [londrina.id, batata.id, 40], [londrina.id, refri.id, 50],
  ];
  for (const [unidadeId, produtoId, quantidade] of estoques) {
    await prisma.estoque.create({ data: { unidadeId, produtoId, quantidade } });
    if (quantidade > 0) {
      await prisma.movimentacaoEstoque.create({
        data: { unidadeId, produtoId, tipo: 'ENTRADA', quantidade, saldoApos: quantidade, motivo: 'Carga inicial' },
      });
    }
  }

  const usuario = (nome: string, email: string, perfil: string, unidadeId: number | null = null) =>
    prisma.usuario.create({ data: { nome, email, senhaHash, perfil, unidadeId } });

  await usuario('Administrador da Rede', 'admin@lanchonete.com', 'ADMIN');
  await usuario('Gerente Matriz', 'gerente@lanchonete.com', 'GERENTE', matriz.id);
  await usuario('Gerente Batel', 'gerente.batel@lanchonete.com', 'GERENTE', batel.id);
  await usuario('Atendente Matriz', 'atendente@lanchonete.com', 'ATENDENTE', matriz.id);
  await usuario('Cozinha Matriz', 'cozinha@lanchonete.com', 'COZINHA', matriz.id);

  const maria = await prisma.usuario.create({
    data: { nome: 'Maria Silva', email: 'maria@email.com', telefone: '41999990000', senhaHash, consentimentoFidelidade: true },
  });
  await prisma.consentimento.create({
    data: { usuarioId: maria.id, finalidade: 'FIDELIDADE', aceito: true, versaoTermo: 'v1', canal: 'APP' },
  });
  await prisma.transacaoFidelidade.create({
    data: { usuarioId: maria.id, tipo: 'BONUS', pontos: 100, descricao: 'Bônus de boas-vindas' },
  });

  await prisma.usuario.create({ data: { nome: 'João Souza', email: 'joao@email.com', senhaHash } });

  const hoje = new Date();
  const umAno = new Date(hoje.getTime() + 365 * 24 * 3600 * 1000);
  const ontem = new Date(hoje.getTime() - 24 * 3600 * 1000);
  await prisma.promocao.createMany({
    data: [
      { codigo: 'BEMVINDO10', descricao: '10% de desconto em pedidos acima de R$ 30', tipo: 'PERCENTUAL', valor: 10, valorMinimoCentavos: 3000, inicio: ontem, fim: umAno },
      { codigo: 'BATEL5', descricao: 'R$ 5 de desconto na Unidade Batel', tipo: 'VALOR_FIXO', valor: 500, valorMinimoCentavos: 2000, unidadeId: batel.id, inicio: ontem, fim: umAno },
      { codigo: 'BLACKFRIDAY', descricao: 'Campanha encerrada', tipo: 'PERCENTUAL', valor: 30, inicio: new Date('2025-11-20'), fim: new Date('2025-11-30') },
    ],
  });

  console.log(`Seed concluído. Senha de todos os usuários: ${SENHA_PADRAO}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
