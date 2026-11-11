import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { FinalidadeConsentimento, Perfil } from '../../domain/enums';
import { PaginacaoQuery } from './comum.dto';

export class AtualizarPerfilDto {
  @ApiPropertyOptional({ example: 'Maria S. Silva' })
  @IsOptional()
  @IsString()
  @Length(3, 100)
  nome?: string;

  @ApiPropertyOptional({ example: '41999990000' })
  @IsOptional()
  @Matches(/^\d{10,11}$/, { message: 'telefone deve ter 10 ou 11 dígitos (somente números)' })
  telefone?: string;
}

export class ConsentimentoDto {
  @ApiProperty({ enum: FinalidadeConsentimento, example: FinalidadeConsentimento.FIDELIDADE })
  @IsEnum(FinalidadeConsentimento, { message: `finalidade deve ser: ${Object.values(FinalidadeConsentimento).join(', ')}` })
  finalidade: FinalidadeConsentimento;

  @ApiProperty({ example: true })
  @IsBoolean()
  aceito: boolean;

  @ApiPropertyOptional({ example: 'APP' })
  @IsOptional()
  @IsString()
  canal?: string;
}

export class CriarColaboradorDto {
  @ApiProperty({ example: 'Ana Atendente' })
  @IsString()
  @Length(3, 100)
  nome: string;

  @ApiProperty({ example: 'ana@lanchonete.com' })
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  email: string;

  @ApiProperty({ example: 'Senha@123' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,64}$/, {
    message: 'senha deve ter de 8 a 64 caracteres, com letra maiúscula, minúscula e número',
  })
  senha: string;

  @ApiProperty({ enum: Perfil, example: Perfil.ATENDENTE })
  @IsEnum(Perfil, { message: `perfil deve ser: ${Object.values(Perfil).join(', ')}` })
  perfil: Perfil;

  @ApiPropertyOptional({ example: 1, description: 'Obrigatório para ATENDENTE, COZINHA e GERENTE' })
  @IsOptional()
  @IsInt()
  @Min(1)
  unidadeId?: number;
}

export class ListarUsuariosQuery extends PaginacaoQuery {
  @ApiPropertyOptional({ enum: Perfil })
  @IsOptional()
  @IsEnum(Perfil)
  perfil?: Perfil;
}

export class IdParam {
  @Type(() => Number)
  @IsInt({ message: 'id deve ser um número inteiro' })
  @Min(1)
  id: number;
}
