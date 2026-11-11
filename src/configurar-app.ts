import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { criarValidationPipe } from './api/erros/validacao';

// usado tanto pelo main.ts quanto pelos testes e2e, pra app de teste ser igual a real
export function configurarApp(app: INestApplication): INestApplication {
  app.use(helmet());
  app.enableCors({ exposedHeaders: ['x-request-id'] });
  app.useGlobalPipes(criarValidationPipe());
  return app;
}

export function gerarDocumentoOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('API Rede de Lanchonetes')
    .setDescription(
      [
        'API back-end multicanal (APP, TOTEM, BALCAO, PICKUP, WEB) para uma rede de lanchonetes com matriz e unidades.',
        '',
        '**Fluxo principal:** login → cardápio da unidade → criar pedido → pagamento (mock) → cozinha (PRONTO) → atendente (ENTREGUE).',
        '',
        '**Autenticação:** use `POST /auth/login` e clique em *Authorize* informando o `accessToken`.',
        'Usuários do seed (senha `Senha@123`): admin@lanchonete.com, gerente@lanchonete.com, atendente@lanchonete.com, cozinha@lanchonete.com, maria@email.com, joao@email.com.',
        '',
        '**Pagamento mock (tokenPagamento):** `tok_aprovado`, `tok_recusado`, `tok_cartao_bloqueado`, `tok_indisponivel` (503), `tok_instavel` (falha e aprova na retentativa).',
        '',
        '**Erros:** todas as falhas seguem o formato `{ error, message, details[], timestamp, path, requestId }`.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  return SwaggerModule.createDocument(app, config);
}
