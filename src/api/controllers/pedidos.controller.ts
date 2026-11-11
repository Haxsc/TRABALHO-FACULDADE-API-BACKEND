import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UsuarioAutenticado } from '../../application/comum';
import { PagamentosService } from '../../application/pagamentos.service';
import { PedidosService } from '../../application/pedidos.service';
import { Perfil } from '../../domain/enums';
import {
  AtualizarStatusDto,
  CancelarPedidoDto,
  CriarPedidoDto,
  ListarPedidosQuery,
  PagamentoRespostaDto,
  PaginaPedidosDto,
  PedidoRespostaDto,
  ResumoCanalQuery,
  SolicitarPagamentoDto,
} from '../dtos/pedidos.dto';
import { Perfis, UsuarioAtual } from '../seguranca/decorators';
import { IdPipe, RespostasErro } from './swagger-helpers';

const headerIdempotencia = ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: 'Chave única por operação. Reenviar a mesma chave devolve o recurso já criado (200) em vez de duplicar.',
});

@ApiTags('Pedidos')
@ApiBearerAuth()
@Controller('pedidos')
export class PedidosController {
  constructor(
    private readonly pedidos: PedidosService,
    private readonly pagamentos: PagamentosService,
  ) {}

  @Post()
  @Perfis(Perfil.CLIENTE, Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN)
  @headerIdempotencia
  @ApiOperation({
    summary: 'Criar pedido',
    description:
      'Valida canal, unidade, produtos e estoque; aplica promoção e pontos; reserva o estoque e deixa o pedido AGUARDANDO_PAGAMENTO.',
  })
  @ApiResponse({ status: 201, type: PedidoRespostaDto })
  @ApiResponse({ status: 200, type: PedidoRespostaDto, description: 'Mesma Idempotency-Key: pedido já existente' })
  @RespostasErro(401, 403, 404, 409, 422)
  async criar(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Body() dto: CriarPedidoDto,
    @Headers('idempotency-key') chave: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { pedido, reaproveitado } = await this.pedidos.criar(u, dto, chave);
    res.status(reaproveitado ? 200 : 201);
    return pedido;
  }

  @Get()
  @ApiOperation({
    summary: 'Listar pedidos',
    description: 'Filtros por canalPedido, status, unidade e período. Cliente vê só os próprios; equipe vê só a própria unidade.',
  })
  @ApiResponse({ status: 200, type: PaginaPedidosDto })
  @RespostasErro(401, 403, 422)
  listar(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: ListarPedidosQuery) {
    return this.pedidos.listar(u, q);
  }

  @Get('resumo-por-canal')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Consolidado de pedidos por canal', description: 'Quantidade e valor dos pedidos não cancelados por canal de origem.' })
  @RespostasErro(401, 403, 422)
  resumo(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: ResumoCanalQuery) {
    return this.pedidos.resumoPorCanal(u, q.unidadeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar pedido (com histórico de status)' })
  @RespostasErro(400, 401, 403, 404)
  obter(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', IdPipe) id: number) {
    return this.pedidos.obter(u, id);
  }

  @Patch(':id/status')
  @Perfis(Perfil.COZINHA, Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({
    summary: 'Atualizar status',
    description: 'EM_PREPARO -> PRONTO (cozinha/gerente) e PRONTO -> ENTREGUE (atendente/gerente). Pagamento é quem tira o pedido de AGUARDANDO_PAGAMENTO.',
  })
  @RespostasErro(400, 401, 403, 404, 409, 422)
  status(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', IdPipe) id: number, @Body() dto: AtualizarStatusDto) {
    return this.pedidos.atualizarStatus(u, id, dto.status);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancelar pedido',
    description: 'Devolve o estoque e os pontos. Se já estiver pago, só GERENTE/ADMIN cancelam e o pagamento é estornado no gateway.',
  })
  @RespostasErro(400, 401, 403, 404, 409)
  cancelar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', IdPipe) id: number, @Body() dto: CancelarPedidoDto) {
    return this.pedidos.cancelar(u, id, dto.motivo);
  }

  @Get(':id/pagamentos')
  @ApiOperation({ summary: 'Tentativas de pagamento do pedido' })
  @RespostasErro(400, 401, 403, 404)
  pagamentosDoPedido(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', IdPipe) id: number) {
    return this.pagamentos.listarDoPedido(u, id);
  }
}

@ApiTags('Pagamentos')
@ApiBearerAuth()
@Controller('pagamentos')
export class PagamentosController {
  constructor(private readonly pagamentos: PagamentosService) {}

  @Post()
  @Perfis(Perfil.CLIENTE, Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN)
  @headerIdempotencia
  @ApiOperation({
    summary: 'Solicitar pagamento (gateway mock)',
    description:
      'Envia a cobrança ao gateway simulado. APROVADO move o pedido para EM_PREPARO e credita pontos; RECUSADO move para PAGAMENTO_RECUSADO (permite nova tentativa). ' +
      'Falha temporária do gateway é re-tentada automaticamente; se persistir, retorna 503 e o pedido continua aguardando pagamento.',
  })
  @ApiResponse({ status: 201, type: PagamentoRespostaDto, description: 'Pagamento processado (APROVADO ou RECUSADO — ver campo status)' })
  @ApiResponse({ status: 200, type: PagamentoRespostaDto, description: 'Mesma Idempotency-Key: pagamento já processado' })
  @RespostasErro(401, 403, 404, 409, 422, 503)
  async solicitar(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Body() dto: SolicitarPagamentoDto,
    @Headers('idempotency-key') chave: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { pagamento, reaproveitado } = await this.pagamentos.solicitar(u, dto, chave);
    res.status(reaproveitado ? 200 : 201);
    return pagamento;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar pagamento' })
  @ApiResponse({ status: 200, type: PagamentoRespostaDto })
  @RespostasErro(400, 401, 403, 404)
  obter(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', IdPipe) id: number) {
    return this.pagamentos.obter(u, id);
  }
}
