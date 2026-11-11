import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CategoriaProduto, TipoMovimentacao, TipoPromocao } from '../../domain/enums';
import { PaginacaoQuery } from './comum.dto';

export class CriarUnidadeDto {
  @ApiProperty({ example: 'Unidade Água Verde' }) @IsString() @Length(3, 100) nome: string;
  @ApiProperty({ example: 'Curitiba' }) @IsString() @Length(2, 80) cidade: string;
  @ApiProperty({ example: 'PR' }) @Matches(/^[A-Za-z]{2}$/, { message: 'uf deve ter 2 letras' }) uf: string;
  @ApiProperty({ example: 'Av. República Argentina, 3000' }) @IsString() @Length(5, 200) endereco: string;
}

export class ListarUnidadesQuery extends PaginacaoQuery {
  @ApiPropertyOptional({ example: 'Curitiba' }) @IsOptional() @IsString() cidade?: string;
}

export class CardapioQuery {
  @ApiPropertyOptional({ enum: CategoriaProduto }) @IsOptional() @IsEnum(CategoriaProduto) categoria?: CategoriaProduto;
}

export class CriarProdutoDto {
  @ApiProperty({ example: 'X-Frango' }) @IsString() @Length(2, 100) nome: string;

  @ApiPropertyOptional({ example: 'Filé de frango empanado, alface e maionese' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  descricao?: string;

  @ApiProperty({ enum: CategoriaProduto, example: CategoriaProduto.LANCHE })
  @IsEnum(CategoriaProduto, { message: `categoria deve ser: ${Object.values(CategoriaProduto).join(', ')}` })
  categoria: CategoriaProduto;

  @ApiProperty({ example: 28.9, description: 'Preço em reais' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'preco deve ser numérico com até 2 casas decimais' })
  @IsPositive({ message: 'preco deve ser maior que zero' })
  preco: number;
}

export class AtualizarProdutoDto {
  @ApiPropertyOptional({ example: 'X-Frango Especial' }) @IsOptional() @IsString() @Length(2, 100) nome?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) descricao?: string;
  @ApiPropertyOptional({ enum: CategoriaProduto }) @IsOptional() @IsEnum(CategoriaProduto) categoria?: CategoriaProduto;

  @ApiPropertyOptional({ example: 29.9 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'preco deve ser maior que zero' })
  preco?: number;

  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean() ativo?: boolean;
}

export class ListarProdutosQuery extends PaginacaoQuery {
  @ApiPropertyOptional({ enum: CategoriaProduto }) @IsOptional() @IsEnum(CategoriaProduto) categoria?: CategoriaProduto;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  incluirInativos?: boolean;
}

export class MovimentarEstoqueDto {
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) unidadeId: number;
  @ApiProperty({ example: 9 }) @IsInt() @Min(1) produtoId: number;

  @ApiProperty({ enum: [TipoMovimentacao.ENTRADA, TipoMovimentacao.SAIDA], example: TipoMovimentacao.ENTRADA })
  @IsIn([TipoMovimentacao.ENTRADA, TipoMovimentacao.SAIDA], { message: 'tipo deve ser ENTRADA ou SAIDA' })
  tipo: TipoMovimentacao.ENTRADA | TipoMovimentacao.SAIDA;

  @ApiProperty({ example: 20 })
  @IsInt({ message: 'quantidade deve ser um número inteiro' })
  @Min(1, { message: 'quantidade deve ser maior que zero' })
  @Max(10000)
  quantidade: number;

  @ApiPropertyOptional({ example: 'Reposição do fornecedor' }) @IsOptional() @IsString() @MaxLength(200) motivo?: string;
}

export class EstoqueQuery {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt({ message: 'unidadeId é obrigatório e deve ser inteiro' }) @Min(1) unidadeId: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  abaixoDoMinimo?: boolean;
}

export class MovimentacoesQuery extends PaginacaoQuery {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt({ message: 'unidadeId é obrigatório e deve ser inteiro' }) @Min(1) unidadeId: number;
  @ApiPropertyOptional({ example: 9 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) produtoId?: number;
}

export class PromocoesQuery {
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) unidadeId?: number;
}

export class CriarPromocaoDto {
  @ApiProperty({ example: 'COMBO20' }) @Matches(/^[A-Za-z0-9_-]{3,30}$/, { message: 'codigo deve ter 3 a 30 letras/números' }) codigo: string;
  @ApiProperty({ example: '20% de desconto em pedidos acima de R$ 50' }) @IsString() @Length(3, 200) descricao: string;

  @ApiProperty({ enum: TipoPromocao, example: TipoPromocao.PERCENTUAL })
  @IsEnum(TipoPromocao, { message: 'tipo deve ser PERCENTUAL ou VALOR_FIXO' })
  tipo: TipoPromocao;

  @ApiProperty({ example: 20, description: 'Percentual (1-100) ou valor em reais' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor: number;

  @ApiPropertyOptional({ example: 50 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) valorMinimo?: number;
  @ApiPropertyOptional({ example: null, description: 'Vazio = vale para toda a rede' }) @IsOptional() @IsInt() @Min(1) unidadeId?: number;
  @ApiProperty({ example: '2026-01-01T00:00:00Z' }) @IsDateString() inicio: string;
  @ApiProperty({ example: '2026-12-31T23:59:59Z' }) @IsDateString() fim: string;
}
