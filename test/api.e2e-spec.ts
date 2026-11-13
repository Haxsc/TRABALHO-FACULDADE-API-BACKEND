import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';

// ids do seed
const MATRIZ = 1;
const BATEL = 2;
const X_BURGER = 1;
const BATATA = 5;
const REFRI = 7;
const MILKSHAKE = 9; // só 2 unidades na matriz

describe('API Rede de Lanchonetes (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const tokens: Record<string, string> = {};

  const login = async (email: string) => {
    const r = await http.post('/auth/login').send({ email, senha: 'Senha@123' }).expect(200);
    return r.body.accessToken as string;
  };
  const auth = (quem: string) => ({ Authorization: `Bearer ${tokens[quem]}` });

  const novoPedido = (quem: string, body: Record<string, unknown> = {}) =>
    http
      .post('/pedidos')
      .set(auth(quem))
      .send({
        canalPedido: 'APP',
        unidadeId: MATRIZ,
        itens: [{ produtoId: X_BURGER, quantidade: 1 }],
        formaPagamento: 'PIX',
        ...body,
      });

  const pagar = (quem: string, pedidoId: number, tokenPagamento = 'tok_aprovado') =>
    http.post('/pagamentos').set(auth(quem)).send({ pedidoId, metodo: 'PIX', tokenPagamento });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    http = request(app.getHttpServer());

    for (const [quem, email] of Object.entries({
      admin: 'admin@lanchonete.com',
      gerente: 'gerente@lanchonete.com',
      gerenteBatel: 'gerente.batel@lanchonete.com',
      atendente: 'atendente@lanchonete.com',
      cozinha: 'cozinha@lanchonete.com',
      maria: 'maria@email.com',
      joao: 'joao@email.com',
    })) {
      tokens[quem] = await login(email);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Autenticação e autorização', () => {
    it('T01 login válido devolve accessToken', async () => {
      const r = await http.post('/auth/login').send({ email: 'maria@email.com', senha: 'Senha@123' }).expect(200);
      expect(r.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600, user: { perfil: 'CLIENTE' } });
      expect(r.body.accessToken).toBeDefined();
      expect(r.body.user.senhaHash).toBeUndefined();
    });

    it('T02 senha errada -> 401 no formato padrão', async () => {
      const r = await http.post('/auth/login').send({ email: 'maria@email.com', senha: 'errada' }).expect(401);
      expect(r.body).toMatchObject({ error: 'CREDENCIAIS_INVALIDAS', path: '/auth/login', details: [] });
      expect(r.body.timestamp).toBeDefined();
    });

    it('T03 listar pedidos sem token -> 401', async () => {
      const r = await http.get('/pedidos').expect(401);
      expect(r.body.error).toBe('TOKEN_AUSENTE');
    });

    it('T04 cliente tentando movimentar estoque -> 403', async () => {
      const r = await http
        .post('/estoque/movimentacoes')
        .set(auth('maria'))
        .send({ unidadeId: MATRIZ, produtoId: X_BURGER, tipo: 'ENTRADA', quantidade: 10 })
        .expect(403);
      expect(r.body.error).toBe('ACESSO_NEGADO');
    });

    it('T05 gerente de outra unidade não vê estoque da matriz -> 403', async () => {
      await http.get(`/estoque?unidadeId=${MATRIZ}`).set(auth('gerenteBatel')).expect(403);
    });

    it('refresh token gera novo par e o antigo deixa de valer', async () => {
      const l = await http.post('/auth/login').send({ email: 'joao@email.com', senha: 'Senha@123' }).expect(200);
      const r = await http.post('/auth/refresh').send({ refreshToken: l.body.refreshToken }).expect(200);
      expect(r.body.accessToken).toBeDefined();
      await http.post('/auth/refresh').send({ refreshToken: l.body.refreshToken }).expect(401);
    });
  });

  describe('Validação de dados', () => {
    it('T06 pedido sem canalPedido -> 422 com detalhe do campo', async () => {
      const r = await http
        .post('/pedidos')
        .set(auth('maria'))
        .send({ unidadeId: MATRIZ, itens: [{ produtoId: X_BURGER, quantidade: 1 }], formaPagamento: 'PIX' })
        .expect(422);
      expect(r.body.error).toBe('VALIDACAO');
      expect(r.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'canalPedido' })]));
    });

    it('T07 canalPedido inválido e quantidade negativa -> 422', async () => {
      const r = await novoPedido('maria', { canalPedido: 'FAX', itens: [{ produtoId: X_BURGER, quantidade: -2 }] }).expect(422);
      const campos = r.body.details.map((d: { field: string }) => d.field);
      expect(campos).toEqual(expect.arrayContaining(['canalPedido', 'itens[0].quantidade']));
    });

    it('T08 cadastro com e-mail inválido -> 422', async () => {
      const r = await http
        .post('/auth/registrar')
        .send({ nome: 'Teste', email: 'nao-e-email', senha: 'Senha@123' })
        .expect(422);
      expect(r.body.details[0].field).toBe('email');
    });

    it('JSON mal formado -> 400', async () => {
      const r = await http
        .post('/pedidos')
        .set(auth('maria'))
        .set('Content-Type', 'application/json')
        .send('{"canalPedido": ')
        .expect(400);
      expect(r.body.error).toBe('JSON_INVALIDO');
    });
  });

  describe('Fluxo crítico: pedido -> pagamento mock -> status', () => {
    let pedidoId: number;

    it('T09 pedido válido -> 201 AGUARDANDO_PAGAMENTO com canal e total', async () => {
      const r = await novoPedido('maria', {
        canalPedido: 'TOTEM',
        itens: [
          { produtoId: X_BURGER, quantidade: 2 },
          { produtoId: BATATA, quantidade: 1 },
        ],
        codigoPromocao: 'BEMVINDO10',
      }).expect(201);

      expect(r.body).toMatchObject({
        canalPedido: 'TOTEM',
        status: 'AGUARDANDO_PAGAMENTO',
        subtotal: 64.7,
        descontoPromocao: 6.47,
        total: 58.23,
      });
      pedidoId = r.body.pedidoId;
    });

    it('T10 produto inexistente -> 404', async () => {
      const r = await novoPedido('maria', { itens: [{ produtoId: 999, quantidade: 1 }] }).expect(404);
      expect(r.body.error).toBe('PRODUTO_NAO_ENCONTRADO');
      expect(r.body.details[0].field).toBe('itens[0].produtoId');
    });

    it('T11 unidade inexistente -> 404', async () => {
      const r = await novoPedido('maria', { unidadeId: 999 }).expect(404);
      expect(r.body.error).toBe('UNIDADE_NAO_ENCONTRADA');
    });

    it('T12 estoque insuficiente -> 409', async () => {
      const r = await novoPedido('maria', { itens: [{ produtoId: MILKSHAKE, quantidade: 5 }] }).expect(409);
      expect(r.body).toMatchObject({ error: 'ESTOQUE_INSUFICIENTE', details: [{ field: 'itens[0].quantidade', issue: 'Disponível: 2' }] });
    });

    it('T13 pagamento aprovado -> pedido EM_PREPARO e pontos creditados', async () => {
      const r = await pagar('maria', pedidoId).expect(201);
      expect(r.body).toMatchObject({ status: 'APROVADO', statusPedido: 'EM_PREPARO', codigoRetorno: '00', pontosAcumulados: 58 });

      const saldo = await http.get('/fidelidade/saldo').set(auth('maria')).expect(200);
      expect(saldo.body.saldoPontos).toBe(158);
    });

    it('pagar de novo um pedido já pago -> 409', async () => {
      const r = await pagar('maria', pedidoId).expect(409);
      expect(r.body.error).toBe('PEDIDO_NAO_AGUARDA_PAGAMENTO');
    });

    it('T14 cozinha marca PRONTO e atendente marca ENTREGUE', async () => {
      const pronto = await http.patch(`/pedidos/${pedidoId}/status`).set(auth('cozinha')).send({ status: 'PRONTO' }).expect(200);
      expect(pronto.body.status).toBe('PRONTO');

      const entregue = await http.patch(`/pedidos/${pedidoId}/status`).set(auth('atendente')).send({ status: 'ENTREGUE' }).expect(200);
      expect(entregue.body.historicoStatus.map((h: { para: string }) => h.para)).toEqual([
        'AGUARDANDO_PAGAMENTO',
        'EM_PREPARO',
        'PRONTO',
        'ENTREGUE',
      ]);
    });

    it('T15 pagamento recusado -> PAGAMENTO_RECUSADO e nova tentativa aprovada', async () => {
      const p = await novoPedido('maria').expect(201);
      const recusado = await pagar('maria', p.body.pedidoId, 'tok_recusado').expect(201);
      expect(recusado.body).toMatchObject({
        status: 'RECUSADO',
        statusPedido: 'PAGAMENTO_RECUSADO',
        codigoRetorno: '51',
        mensagem: 'Transação recusada: saldo insuficiente',
      });

      const aprovado = await pagar('maria', p.body.pedidoId).expect(201);
      expect(aprovado.body.statusPedido).toBe('EM_PREPARO');
    });

    it('T16 gateway fora do ar -> 503 e o pedido continua aguardando', async () => {
      const p = await novoPedido('maria').expect(201);
      const r = await pagar('maria', p.body.pedidoId, 'tok_indisponivel').expect(503);
      expect(r.body.error).toBe('GATEWAY_INDISPONIVEL');

      const pedido = await http.get(`/pedidos/${p.body.pedidoId}`).set(auth('maria')).expect(200);
      expect(pedido.body.status).toBe('AGUARDANDO_PAGAMENTO');
    });

    it('gateway instável é re-tentado e aprova', async () => {
      const p = await novoPedido('maria').expect(201);
      const r = await pagar('maria', p.body.pedidoId, 'tok_instavel').expect(201);
      expect(r.body).toMatchObject({ status: 'APROVADO', tentativas: 2 });
    });

    it('cozinha não pode pular etapa (AGUARDANDO -> PRONTO) -> 409', async () => {
      const p = await novoPedido('maria').expect(201);
      const r = await http.patch(`/pedidos/${p.body.pedidoId}/status`).set(auth('cozinha')).send({ status: 'PRONTO' }).expect(409);
      expect(r.body.error).toBe('TRANSICAO_INVALIDA');
    });
  });

  describe('Multicanalidade', () => {
    it('T17 filtra pedidos por canal', async () => {
      await http
        .post('/pedidos')
        .set(auth('atendente'))
        .send({ canalPedido: 'BALCAO', unidadeId: MATRIZ, itens: [{ produtoId: REFRI, quantidade: 1 }], formaPagamento: 'MOCK' })
        .expect(201);

      const r = await http.get('/pedidos?canalPedido=BALCAO').set(auth('gerente')).expect(200);
      expect(r.body.data.length).toBeGreaterThan(0);
      expect(r.body.data.every((p: { canalPedido: string }) => p.canalPedido === 'BALCAO')).toBe(true);
      expect(r.body.meta).toMatchObject({ page: 1, limit: 10 });
    });

    it('T18 cliente não pode usar o canal BALCAO -> 403', async () => {
      const r = await novoPedido('maria', { canalPedido: 'BALCAO' }).expect(403);
      expect(r.body.error).toBe('CANAL_NAO_PERMITIDO');
    });

    it('resumo por canal para o gerente', async () => {
      const r = await http.get('/pedidos/resumo-por-canal').set(auth('gerente')).expect(200);
      const balcao = r.body.canais.find((c: { canalPedido: string }) => c.canalPedido === 'BALCAO');
      expect(balcao.quantidadePedidos).toBeGreaterThan(0);
    });
  });

  describe('Regras complementares', () => {
    it('T19 mesma Idempotency-Key não duplica o pedido', async () => {
      const a = await novoPedido('maria').set('Idempotency-Key', 'pedido-teste-123').expect(201);
      const b = await novoPedido('maria').set('Idempotency-Key', 'pedido-teste-123').expect(200);
      expect(b.body.pedidoId).toBe(a.body.pedidoId);
    });

    it('T20 cancelar devolve o estoque', async () => {
      const antes = await http.get(`/estoque?unidadeId=${MATRIZ}`).set(auth('gerente')).expect(200);
      const qtd = (r: request.Response) => r.body.itens.find((i: { produtoId: number }) => i.produtoId === MILKSHAKE).quantidade;

      const p = await novoPedido('maria', { itens: [{ produtoId: MILKSHAKE, quantidade: 2 }] }).expect(201);
      const durante = await http.get(`/estoque?unidadeId=${MATRIZ}`).set(auth('gerente')).expect(200);
      expect(qtd(durante)).toBe(qtd(antes) - 2);

      const c = await http.post(`/pedidos/${p.body.pedidoId}/cancelar`).set(auth('maria')).send({ motivo: 'desisti' }).expect(200);
      expect(c.body.status).toBe('CANCELADO');
      const depois = await http.get(`/estoque?unidadeId=${MATRIZ}`).set(auth('gerente')).expect(200);
      expect(qtd(depois)).toBe(qtd(antes));
    });

    it('cliente não cancela pedido já pago -> 403; gerente cancela com estorno', async () => {
      const p = await novoPedido('maria').expect(201);
      await pagar('maria', p.body.pedidoId).expect(201);
      await http.post(`/pedidos/${p.body.pedidoId}/cancelar`).set(auth('maria')).send({}).expect(403);
      await http.post(`/pedidos/${p.body.pedidoId}/cancelar`).set(auth('gerente')).send({ motivo: 'erro no pedido' }).expect(200);

      const pags = await http.get(`/pedidos/${p.body.pedidoId}/pagamentos`).set(auth('gerente')).expect(200);
      expect(pags.body[0].status).toBe('ESTORNADO');
    });

    it('resgate de pontos sem consentimento -> 409', async () => {
      const r = await novoPedido('joao', { pontosResgatar: 10 }).expect(409);
      expect(r.body.error).toBe('FIDELIDADE_SEM_CONSENTIMENTO');
    });

    it('resgate de pontos com consentimento aplica desconto', async () => {
      const r = await novoPedido('maria', { itens: [{ produtoId: X_BURGER, quantidade: 2 }], pontosResgatar: 50 }).expect(201);
      expect(r.body).toMatchObject({ descontoPontos: 5, pontosResgatados: 50, total: 46.8 });
    });

    it('cliente não enxerga pedido de outro cliente -> 404', async () => {
      const p = await novoPedido('maria').expect(201);
      await http.get(`/pedidos/${p.body.pedidoId}`).set(auth('joao')).expect(404);
    });

    it('promoção de outra unidade -> 422', async () => {
      const r = await novoPedido('maria', { codigoPromocao: 'BATEL5', itens: [{ produtoId: X_BURGER, quantidade: 2 }] }).expect(422);
      expect(r.body.error).toBe('PROMOCAO_INVALIDA');
    });

    it('cardápio da unidade Batel é público e mostra só os itens dela', async () => {
      const r = await http.get(`/unidades/${BATEL}/cardapio`).expect(200);
      expect(r.body.itens.map((i: { nome: string }) => i.nome)).not.toContain('Onion Rings');
    });
  });

  describe('Auditoria e LGPD', () => {
    it('T21 criação de pedido e mudança de status geram auditoria', async () => {
      const p = await novoPedido('maria').expect(201);
      const r = await http
        .get(`/auditoria?acao=PEDIDO_CRIADO&entidade=Pedido&entidadeId=${p.body.pedidoId}`)
        .set(auth('admin'))
        .expect(200);
      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0]).toMatchObject({ acao: 'PEDIDO_CRIADO', usuarioId: 6, perfil: 'CLIENTE' });
      expect(r.body.data[0].detalhes.canalPedido).toBe('APP');
      expect(r.body.data[0].requestId).toBeDefined();

      const status = await http.get('/auditoria?acao=PEDIDO_STATUS_ALTERADO').set(auth('admin')).expect(200);
      expect(status.body.meta.total).toBeGreaterThan(0);
    });

    it('cliente não acessa auditoria -> 403', async () => {
      await http.get('/auditoria').set(auth('maria')).expect(403);
    });

    it('listagem de usuários mascara e-mail e não expõe senha', async () => {
      const r = await http.get('/usuarios?perfil=CLIENTE').set(auth('admin')).expect(200);
      const maria = r.body.data.find((u: { id: number }) => u.id === 6);
      expect(maria.email).toBe('ma***@email.com');
      expect(maria.senhaHash).toBeUndefined();
    });

    it('T22 exportação e anonimização da conta (LGPD)', async () => {
      await http
        .post('/auth/registrar')
        .send({ nome: 'Pessoa Teste', email: 'pessoa@teste.com', senha: 'Senha@123', aceitaFidelidade: true })
        .expect(201);
      const token = await login('pessoa@teste.com');

      const dados = await http.get('/usuarios/me/exportar').set({ Authorization: `Bearer ${token}` }).expect(200);
      expect(dados.body.consentimentos[0]).toMatchObject({ finalidade: 'FIDELIDADE', aceito: true });

      await http.delete('/usuarios/me').set({ Authorization: `Bearer ${token}` }).expect(204);
      await http.get('/usuarios/me').set({ Authorization: `Bearer ${token}` }).expect(401);
      await http.post('/auth/login').send({ email: 'pessoa@teste.com', senha: 'Senha@123' }).expect(401);
    });
  });
});
