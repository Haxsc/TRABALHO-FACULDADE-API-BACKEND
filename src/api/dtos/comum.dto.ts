import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginacaoQuery {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MetaPaginacao {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 10 }) limit: number;
  @ApiProperty({ example: 42 }) total: number;
  @ApiProperty({ example: 5 }) totalPages: number;
}

class DetalheErroDto {
  @ApiProperty({ example: 'itens[0].quantidade' }) field: string;
  @ApiProperty({ example: 'Disponível: 1' }) issue: string;
}

export class ErroDto {
  @ApiProperty({ example: 'ESTOQUE_INSUFICIENTE' }) error: string;
  @ApiProperty({ example: 'Não há quantidade suficiente para um ou mais itens.' }) message: string;
  @ApiProperty({ type: [DetalheErroDto] }) details: DetalheErroDto[];
  @ApiProperty({ example: '2026-02-05T12:00:00.000Z' }) timestamp: string;
  @ApiProperty({ example: '/pedidos' }) path: string;
  @ApiProperty({ example: '6f1c2e0a-9b7d-4c1e-8f5a-2d3b4c5d6e7f' }) requestId: string;
}
