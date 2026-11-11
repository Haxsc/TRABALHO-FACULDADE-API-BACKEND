import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CatalogoService } from '../../application/catalogo.service';
import { UsuarioAutenticado } from '../../application/comum';
import { Perfil } from '../../domain/enums';
import {
  AtualizarProdutoDto,
  CardapioQuery,
  CriarProdutoDto,
  CriarPromocaoDto,
  CriarUnidadeDto,
  ListarProdutosQuery,
  ListarUnidadesQuery,
  PromocoesQuery,
} from '../dtos/catalogo.dto';
import { Perfis, Publico, UsuarioAtual } from '../seguranca/decorators';
import { IdPipe, RespostasErro } from './swagger-helpers';

@ApiTags('Unidades')
@Controller('unidades')
export class UnidadesController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Listar unidades da rede' })
  @RespostasErro(422)
  listar(@Query() q: ListarUnidadesQuery) {
    return this.catalogo.listarUnidades(q);
  }

  @Get(':id')
  @Publico()
  @ApiOperation({ summary: 'Detalhar unidade' })
  @RespostasErro(400, 404)
  obter(@Param('id', IdPipe) id: number) {
    return this.catalogo.obterUnidade(id);
  }

  @Get(':id/cardapio')
  @Publico()
  @ApiOperation({ summary: 'Cardápio da unidade', description: 'Produtos ativos que a unidade trabalha, com indicação de disponibilidade conforme o estoque local.' })
  @RespostasErro(400, 404)
  cardapio(@Param('id', IdPipe) id: number, @Query() q: CardapioQuery) {
    return this.catalogo.cardapio(id, q.categoria);
  }

  @Post()
  @ApiBearerAuth()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cadastrar unidade (ADMIN)' })
  @ApiResponse({ status: 201 })
  @RespostasErro(401, 403, 422)
  criar(@Body() dto: CriarUnidadeDto) {
    return this.catalogo.criarUnidade(dto);
  }
}

@ApiTags('Produtos')
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Listar produtos do catálogo' })
  @RespostasErro(422)
  listar(@Query() q: ListarProdutosQuery) {
    return this.catalogo.listarProdutos(q);
  }

  @Get(':id')
  @Publico()
  @ApiOperation({ summary: 'Detalhar produto' })
  @RespostasErro(400, 404)
  obter(@Param('id', IdPipe) id: number) {
    return this.catalogo.obterProduto(id);
  }

  @Post()
  @ApiBearerAuth()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cadastrar produto (ADMIN)', description: 'O catálogo é definido pela matriz.' })
  @ApiResponse({ status: 201 })
  @RespostasErro(401, 403, 409, 422)
  criar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: CriarProdutoDto) {
    return this.catalogo.criarProduto(u, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Atualizar produto (ADMIN)' })
  @RespostasErro(400, 401, 403, 404, 422)
  atualizar(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', IdPipe) id: number, @Body() dto: AtualizarProdutoDto) {
    return this.catalogo.atualizarProduto(u, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Desativar produto (ADMIN)', description: 'Exclusão lógica: o produto sai do cardápio mas continua nos pedidos antigos.' })
  @ApiResponse({ status: 204 })
  @RespostasErro(400, 401, 403, 404)
  async remover(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', IdPipe) id: number) {
    await this.catalogo.desativarProduto(u, id);
  }
}

@ApiTags('Promoções')
@Controller('promocoes')
export class PromocoesController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Promoções vigentes', description: 'Informe unidadeId para incluir campanhas locais da unidade.' })
  @RespostasErro(422)
  listar(@Query() q: PromocoesQuery) {
    return this.catalogo.listarPromocoesVigentes(q.unidadeId);
  }

  @Post()
  @ApiBearerAuth()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Criar promoção/campanha (ADMIN)' })
  @ApiResponse({ status: 201 })
  @RespostasErro(401, 403, 404, 409, 422)
  criar(@Body() dto: CriarPromocaoDto) {
    return this.catalogo.criarPromocao(dto);
  }
}
