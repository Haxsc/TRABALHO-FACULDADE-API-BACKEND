import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'maria@email.com' })
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  email: string;

  @ApiProperty({ example: 'Senha@123' })
  @IsString()
  @IsNotEmpty({ message: 'senha é obrigatória' })
  senha: string;
}

export class RegistroDto {
  @ApiProperty({ example: 'Carlos Pereira' })
  @IsString()
  @Length(3, 100, { message: 'nome deve ter entre 3 e 100 caracteres' })
  nome: string;

  @ApiProperty({ example: 'carlos@email.com' })
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  @MaxLength(120)
  email: string;

  @ApiProperty({ example: 'Senha@123', description: 'Mínimo 8 caracteres, com letra maiúscula, minúscula e número' })
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,64}$/, {
    message: 'senha deve ter de 8 a 64 caracteres, com letra maiúscula, minúscula e número',
  })
  senha: string;

  @ApiPropertyOptional({ example: '41988887777' })
  @IsOptional()
  @Matches(/^\d{10,11}$/, { message: 'telefone deve ter 10 ou 11 dígitos (somente números)' })
  telefone?: string;

  @ApiPropertyOptional({ example: true, description: 'Consentimento para participar do programa de fidelidade' })
  @IsOptional()
  @IsBoolean()
  aceitaFidelidade?: boolean;
}

export class RefreshDto {
  @ApiProperty({ example: '3f9a...c21' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Se omitido, revoga todas as sessões do usuário' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

class UsuarioLogadoDto {
  @ApiProperty({ example: 6 }) id: number;
  @ApiProperty({ example: 'Maria Silva' }) nome: string;
  @ApiProperty({ example: 'CLIENTE' }) perfil: string;
  @ApiProperty({ example: null, nullable: true }) unidadeId: number | null;
}

export class TokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' }) accessToken: string;
  @ApiProperty({ example: '9c1e5b...' }) refreshToken: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: string;
  @ApiProperty({ example: 3600 }) expiresIn: number;
  @ApiProperty({ type: UsuarioLogadoDto }) user: UsuarioLogadoDto;
}
