import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditoriaService } from './application/auditoria.service';
import { AuthService } from './application/auth.service';
import { CatalogoService } from './application/catalogo.service';
import { EstoqueService } from './application/estoque.service';
import { FidelidadeService } from './application/fidelidade.service';
import { PagamentosService } from './application/pagamentos.service';
import { PedidosService } from './application/pedidos.service';
import { GATEWAY_PAGAMENTO } from './application/ports/gateway-pagamento';
import { UsuariosService } from './application/usuarios.service';
import { AuthController } from './api/controllers/auth.controller';
import { ProdutosController, PromocoesController, UnidadesController } from './api/controllers/catalogo.controller';
import { HealthController } from './api/controllers/health.controller';
import { AuditoriaController, EstoqueController, FidelidadeController } from './api/controllers/operacao.controller';
import { PagamentosController, PedidosController } from './api/controllers/pedidos.controller';
import { UsuariosController } from './api/controllers/usuarios.controller';
import { FiltroErros } from './api/erros/filtro-erros';
import { RequestIdMiddleware } from './api/request-id.middleware';
import { JwtGuard, PerfisGuard } from './api/seguranca/guards';
import { RegistradorAuditoria } from './infrastructure/auditoria/registrador-auditoria';
import { MockGatewayPagamento } from './infrastructure/pagamento/mock-gateway-pagamento';
import { PrismaService } from './infrastructure/prisma/prisma.service';

@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    UsuariosController,
    UnidadesController,
    ProdutosController,
    PromocoesController,
    EstoqueController,
    PedidosController,
    PagamentosController,
    FidelidadeController,
    AuditoriaController,
  ],
  providers: [
    PrismaService,
    RegistradorAuditoria,
    { provide: GATEWAY_PAGAMENTO, useClass: MockGatewayPagamento },
    AuthService,
    UsuariosService,
    CatalogoService,
    EstoqueService,
    FidelidadeService,
    PedidosService,
    PagamentosService,
    AuditoriaService,
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: PerfisGuard },
    { provide: APP_FILTER, useClass: FiltroErros },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
