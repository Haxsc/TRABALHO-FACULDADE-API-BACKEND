# api-rede-lanchonetes

Back-end do projeto multidisciplinar (trilha Back-End) da UNINTER. É uma API pra uma rede de lanchonetes com matriz e várias unidades, que recebe pedidos de canais diferentes (app, totem, web, balcão e pickup).

O fluxo que escolhi fechar foi o **pedido → pagamento (mock) → status**. Também fiz o estoque por unidade, fidelidade, promoções e a parte de LGPD.

Feito com NestJS + Prisma + SQLite.

- Repositório: https://github.com/Haxsc/TRABALHO-FACULDADE-API-BACKEND
- Swagger (com a API rodando): http://localhost:3000/docs
- Coleção do Postman: `postman/`
- DER e diagramas: `docs/diagramas/`

## Requisitos

- Node 20 ou mais novo (usei o 22)
- npm

Não precisa instalar banco, o SQLite é só um arquivo que as migrations criam em `prisma/dev.db`.

## Como rodar

```bash
npm install
cp .env.example .env     # no windows: copy .env.example .env
npm run setup            # roda as migrations e o seed
npm run start:dev
```

A API sobe na porta 3000, e a documentação fica em `/docs` (o JSON do OpenAPI fica em `/docs-json`, e tem uma cópia em `docs/openapi.json`).

Pra zerar o banco e voltar pros dados iniciais: `npm run db:reset`.

### .env

O `.env.example` já vem com valores que funcionam localmente. O único obrigatório é o `JWT_ACCESS_SECRET`. O resto (tempo do token, latência do pagamento mock, limite de login etc.) tem valor padrão.

### Usuários do seed

A senha é `Senha@123` pra todos.

- `admin@lanchonete.com`: admin
- `gerente@lanchonete.com`: gerente da Matriz (unidade 1)
- `gerente.batel@lanchonete.com`: gerente da unidade Batel (2)
- `atendente@lanchonete.com`: atendente da Matriz
- `cozinha@lanchonete.com`: cozinha da Matriz
- `maria@email.com`: cliente que aceitou a fidelidade (já começa com 100 pontos)
- `joao@email.com`: cliente que não aceitou a fidelidade

O Milkshake da Matriz começa com só 2 unidades, de propósito, pra dar pra testar o erro de estoque. As promoções são `BEMVINDO10`, `BATEL5` (só vale na unidade Batel) e `BLACKFRIDAY` (já vencida).

## Testes

```bash
npm test               # unitários + e2e
npm run test:postman   # roda a coleção do postman pelo newman (precisa da API rodando)
```

Os testes e2e usam um banco separado (`prisma/test.db`), que é recriado toda vez, então não mexem no banco de dev.

No Postman, é só importar a coleção e o ambiente da pasta `postman/` e rodar a coleção inteira no Runner. A ordem das pastas importa, porque a primeira faz os logins e guarda os tokens. Os cenários `T01`..`T22` são os mesmos do plano de testes do relatório.

### Testando na mão pelo Swagger

1. Faça login com a maria em `POST /auth/login` e coloque o `accessToken` no botão Authorize.
2. Crie um pedido em `POST /pedidos` (o exemplo já vem preenchido).
3. Pague em `POST /pagamentos` com o `pedidoId` e `tokenPagamento: "tok_aprovado"`.
4. Logue como cozinha e mande `PATCH /pedidos/{id}/status` com `PRONTO`.
5. Logue como atendente e mande `ENTREGUE`.

## Pagamento mock

Não chama nenhum provedor de verdade. O que define o resultado é o `tokenPagamento`:

- `tok_aprovado`: aprova, e o pedido vai pra `EM_PREPARO`
- `tok_recusado` / `tok_cartao_bloqueado`: recusa, e o pedido vai pra `PAGAMENTO_RECUSADO` (dá pra tentar de novo)
- `tok_instavel`: falha na primeira tentativa e aprova na retentativa
- `tok_indisponivel`: o gateway "cai" e a API devolve 503. O pedido continua aguardando pagamento.

Dá pra mandar o header `Idempotency-Key` no pedido e no pagamento. Se a mesma chave chegar de novo, a API devolve o que já tinha criado em vez de duplicar.

## Erros

Todo erro volta no mesmo formato:

```json
{
  "error": "ESTOQUE_INSUFICIENTE",
  "message": "Não há quantidade suficiente para um ou mais itens.",
  "details": [{ "field": "itens[0].quantidade", "issue": "Disponível: 2" }],
  "timestamp": "2026-02-05T12:00:00.000Z",
  "path": "/pedidos",
  "requestId": "6f1c2e0a-..."
}
```

Usei 422 pra validação, 404 pra coisa que não existe, 409 pra regra de negócio (estoque, status, pedido já pago), 401/403 pra acesso e 503 quando o gateway está fora.

## Organização

```
src/
  domain/          regras de negócio (status do pedido, canal x perfil, cálculos, fidelidade, promoção)
  application/     casos de uso
  infrastructure/  prisma, gateway mock, auditoria
  api/             controllers, dtos, guards, tratamento de erro
prisma/            schema, migrations e seed
test/              testes e2e
postman/           coleção e ambiente
docs/              openapi e diagramas
```

Algumas observações sobre o modelo:

- O SQLite não tem enum, então os status e tipos ficam como string no banco e são validados pelos enums do domínio.
- Dinheiro fica em centavos no banco e sai em reais na API.

Sobre LGPD e segurança, que estão detalhados no relatório:

- A senha é guardada com bcrypt.
- O login usa JWT, com refresh token.
- O cliente pode exportar os dados dele (`GET /usuarios/me/exportar`) e excluir a conta (`DELETE /usuarios/me`). A exclusão anonimiza a conta, e os pedidos ficam guardados sem os dados pessoais.
- As ações importantes ficam registradas na tabela de auditoria.
