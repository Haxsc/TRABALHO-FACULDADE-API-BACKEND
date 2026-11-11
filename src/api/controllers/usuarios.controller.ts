import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsuarioAutenticado } from '../../application/comum';
import { UsuariosService } from '../../application/usuarios.service';
import { Perfil } from '../../domain/enums';
import { AtualizarPerfilDto, ConsentimentoDto, CriarColaboradorDto, ListarUsuariosQuery } from '../dtos/usuarios.dto';
import { Perfis, UsuarioAtual } from '../seguranca/decorators';
import { RespostasErro } from './swagger-helpers';

@ApiTags('Usuários / LGPD')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get('me')
  @ApiOperation({ summary: 'Meus dados cadastrais' })
  @RespostasErro(401)
  me(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.usuarios.meuPerfil(u);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Atualizar meus dados (nome/telefone)' })
  @RespostasErro(401, 422)
  atualizar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: AtualizarPerfilDto) {
    return this.usuarios.atualizarMeuPerfil(u, dto);
  }

  @Get('me/consentimentos')
  @ApiOperation({ summary: 'Histórico de consentimentos (LGPD)' })
  @RespostasErro(401)
  consentimentos(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.usuarios.historicoConsentimentos(u);
  }

  @Post('me/consentimentos')
  @ApiOperation({ summary: 'Conceder ou revogar consentimento', description: 'Cada alteração gera um novo registro (prova do consentimento) e um log de auditoria.' })
  @ApiResponse({ status: 201, description: 'Histórico atualizado' })
  @RespostasErro(401, 422)
  alterarConsentimento(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: ConsentimentoDto) {
    return this.usuarios.alterarConsentimento(u, dto.finalidade, dto.aceito, dto.canal);
  }

  @Get('me/exportar')
  @ApiOperation({ summary: 'Exportar meus dados (portabilidade - LGPD art. 18)' })
  @RespostasErro(401)
  exportar(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.usuarios.exportarMeusDados(u);
  }

  @Delete('me')
  @HttpCode(204)
  @Perfis(Perfil.CLIENTE)
  @ApiOperation({ summary: 'Excluir minha conta (anonimização - LGPD)', description: 'Dados pessoais são anonimizados; pedidos são mantidos sem identificação por obrigação fiscal.' })
  @ApiResponse({ status: 204 })
  @RespostasErro(401, 403, 409)
  async excluir(@UsuarioAtual() u: UsuarioAutenticado) {
    await this.usuarios.anonimizarMinhaConta(u);
  }

  @Get()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Listar usuários (ADMIN)', description: 'E-mail e telefone retornam mascarados. O acesso é registrado na auditoria.' })
  @RespostasErro(401, 403)
  listar(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: ListarUsuariosQuery) {
    return this.usuarios.listar(u, q);
  }

  @Post()
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Cadastrar colaborador (ADMIN)' })
  @ApiResponse({ status: 201 })
  @RespostasErro(401, 403, 404, 409, 422)
  criar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: CriarColaboradorDto) {
    return this.usuarios.criarColaborador(u, dto);
  }
}
