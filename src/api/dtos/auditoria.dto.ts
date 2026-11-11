import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginacaoQuery } from './comum.dto';

export class AuditoriaQuery extends PaginacaoQuery {
  @ApiPropertyOptional({ example: 'PEDIDO_CRIADO' }) @IsOptional() @IsString() acao?: string;
  @ApiPropertyOptional({ example: 'Pedido' }) @IsOptional() @IsString() entidade?: string;
  @ApiPropertyOptional({ example: '1' }) @IsOptional() @IsString() entidadeId?: string;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) usuarioId?: number;
}
