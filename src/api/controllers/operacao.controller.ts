import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditoriaService } from '../../application/auditoria.service';
import { UsuarioAutenticado } from '../../application/comum';
import { EstoqueService } from '../../application/estoque.service';
import { FidelidadeService } from '../../application/fidelidade.service';
import { Perfil } from '../../domain/enums';
import { EstoqueQuery, MovimentacoesQuery, MovimentarEstoqueDto } from '../dtos/catalogo.dto';
import { AuditoriaQuery } from '../dtos/auditoria.dto';
import { PaginacaoQuery } from '../dtos/comum.dto';
import { Perfis, UsuarioAtual } from '../seguranca/decorators';
import { RespostasErro } from './swagger-helpers';

@ApiTags('Estoque')
@ApiBearerAuth()
@Controller('estoque')
export class EstoqueController {
  constructor(private readonly estoque: EstoqueService) {}

  @Get()
  @Perfis(Perfil.ATENDENTE, Perfil.COZINHA, Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Saldo de estoque da unidade', description: 'Equipe da loja só consulta a própria unidade.' })
  @RespostasErro(401, 403, 404, 422)
  consultar(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: EstoqueQuery) {
    return this.estoque.consultar(u, q.unidadeId, q.abaixoDoMinimo);
  }

  @Post('movimentacoes')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Registrar entrada/saída de estoque', description: 'SAIDA não pode deixar o saldo negativo (409).' })
  @ApiResponse({ status: 201 })
  @RespostasErro(401, 403, 404, 409, 422)
  movimentar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: MovimentarEstoqueDto) {
    return this.estoque.movimentar(u, dto);
  }

  @Get('movimentacoes')
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Histórico de movimentações da unidade' })
  @RespostasErro(401, 403, 422)
  movimentacoes(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: MovimentacoesQuery) {
    return this.estoque.listarMovimentacoes(u, q.unidadeId, q);
  }
}

@ApiTags('Fidelidade')
@ApiBearerAuth()
@Controller('fidelidade')
@Perfis(Perfil.CLIENTE)
export class FidelidadeController {
  constructor(private readonly fidelidade: FidelidadeService) {}

  @Get('saldo')
  @ApiOperation({ summary: 'Saldo de pontos e regras do programa' })
  @RespostasErro(401, 403)
  saldo(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.fidelidade.saldo(u);
  }

  @Get('extrato')
  @ApiOperation({ summary: 'Extrato de pontos (acúmulos, resgates e estornos)' })
  @RespostasErro(401, 403)
  extrato(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: PaginacaoQuery) {
    return this.fidelidade.extrato(u, q);
  }
}

@ApiTags('Auditoria')
@ApiBearerAuth()
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @Perfis(Perfil.GERENTE, Perfil.ADMIN)
  @ApiOperation({ summary: 'Consultar trilha de auditoria', description: 'Ações sensíveis: login, pedidos, status, pagamentos, estoque, consentimentos e acesso a dados pessoais.' })
  @RespostasErro(401, 403, 422)
  listar(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: AuditoriaQuery) {
    return this.auditoria.listar(u, q);
  }

  @Post('expurgo')
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Expurgar logs fora do prazo de retenção (ADMIN)', description: 'Remove registros mais antigos que AUDIT_RETENTION_DAYS.' })
  @RespostasErro(401, 403)
  expurgo() {
    return this.auditoria.expurgarAntigos();
  }
}
