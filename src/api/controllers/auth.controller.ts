import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from '../../application/auth.service';
import { UsuarioAutenticado } from '../../application/comum';
import { LoginDto, LogoutDto, RefreshDto, RegistroDto, TokenDto } from '../dtos/auth.dto';
import { Publico, UsuarioAtual } from '../seguranca/decorators';
import { RespostasErro } from './swagger-helpers';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('registrar')
  @Publico()
  @ApiOperation({ summary: 'Cadastro de cliente', description: 'Cria uma conta com perfil CLIENTE e registra o consentimento de fidelidade (LGPD).' })
  @ApiResponse({ status: 201, description: 'Conta criada' })
  @RespostasErro(409, 422)
  registrar(@Body() dto: RegistroDto) {
    return this.auth.registrar(dto);
  }

  @Post('login')
  @Publico()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login', description: 'Autentica com e-mail e senha e devolve access token (JWT) e refresh token.' })
  @ApiResponse({ status: 200, type: TokenDto })
  @RespostasErro(401, 422, 429)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.senha);
  }

  @Post('refresh')
  @Publico()
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar token', description: 'Troca um refresh token válido por um novo par de tokens (o anterior é revogado).' })
  @ApiResponse({ status: 200, type: TokenDto })
  @RespostasErro(401, 422)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.renovar(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout', description: 'Revoga o refresh token informado (ou todos do usuário).' })
  @ApiResponse({ status: 204 })
  @RespostasErro(401)
  async logout(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: LogoutDto) {
    await this.auth.logout(u, dto.refreshToken);
  }
}
