import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CanalPedido, FormaPagamento, StatusPedido } from '../../domain/enums';
import { MetaPaginacao, PaginacaoQuery } from './comum.dto';

const msgCanal = `canalPedido é obrigatório e deve ser: ${Object.values(CanalPedido).join(', ')}`;

export class ItemPedidoDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'produtoId deve ser um número inteiro' })
  @Min(1)
  produtoId: number;

  @ApiProperty({ example: 2 })
  @IsInt({ message: 'quantidade deve ser um número inteiro' })
  @Min(1, { message: 'quantidade deve ser maior que zero' })
  @Max(50, { message: 'quantidade máxima por item é 50' })
  quantidade: number;
}

export class CriarPedidoDto {
  @ApiProperty({ enum: CanalPedido, example: CanalPedido.TOTEM, description: 'Canal de origem do pedido (obrigatório)' })
  @IsEnum(CanalPedido, { message: msgCanal })
  canalPedido: CanalPedido;

  @ApiProperty({ example: 1 })
  @IsInt({ message: 'unidadeId é obrigatório e deve ser inteiro' })
  @Min(1)
  unidadeId: number;

  @ApiPropertyOptional({ example: 6, description: 'Para CLIENTE é sempre o próprio usuário. Equipe da loja pode informar ou omitir (balcão sem cadastro).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  clienteId?: number;

  @ApiProperty({ type: [ItemPedidoDto] })
  @IsArray({ message: 'itens deve ser uma lista' })
  @ArrayMinSize(1, { message: 'o pedido precisa de pelo menos 1 item' })
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  itens: ItemPedidoDto[];

  @ApiProperty({ enum: FormaPagamento, example: FormaPagamento.PIX })
  @IsEnum(FormaPagamento, { message: `formaPagamento deve ser: ${Object.values(FormaPagamento).join(', ')}` })
  formaPagamento: FormaPagamento;

  @ApiPropertyOptional({ example: 'BEMVINDO10' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  codigoPromocao?: string;

  @ApiPropertyOptional({ example: 20, description: 'Múltiplos de 10. 10 pontos = R$ 1,00' })
  @IsOptional()
  @IsInt()
  @Min(0)
  pontosResgatar?: number;

  @ApiPropertyOptional({ example: 'Sem cebola' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  observacao?: string;
}

export class ListarPedidosQuery extends PaginacaoQuery {
  @ApiPropertyOptional({ enum: CanalPedido, example: CanalPedido.TOTEM })
  @IsOptional()
  @IsEnum(CanalPedido, { message: `canalPedido deve ser: ${Object.values(CanalPedido).join(', ')}` })
  canalPedido?: CanalPedido;

  @ApiPropertyOptional({ enum: StatusPedido })
  @IsOptional()
  @IsEnum(StatusPedido, { message: `status deve ser: ${Object.values(StatusPedido).join(', ')}` })
  status?: StatusPedido;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unidadeId?: number;

  @ApiPropertyOptional({ example: '2026-01-01' }) @IsOptional() @IsDateString() dataInicio?: string;
  @ApiPropertyOptional({ example: '2026-12-31' }) @IsOptional() @IsDateString() dataFim?: string;
}

export class ResumoCanalQuery {
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) unidadeId?: number;
}

export class AtualizarStatusDto {
  @ApiProperty({ enum: [StatusPedido.PRONTO, StatusPedido.ENTREGUE], example: StatusPedido.PRONTO })
  @IsEnum(StatusPedido, { message: `status deve ser: ${Object.values(StatusPedido).join(', ')}` })
  status: StatusPedido;
}

export class CancelarPedidoDto {
  @ApiPropertyOptional({ example: 'Cliente desistiu' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}

export class SolicitarPagamentoDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'pedidoId é obrigatório e deve ser inteiro' })
  @Min(1)
  pedidoId: number;

  @ApiProperty({ enum: FormaPagamento, example: FormaPagamento.PIX })
  @IsEnum(FormaPagamento, { message: `metodo deve ser: ${Object.values(FormaPagamento).join(', ')}` })
  metodo: FormaPagamento;

  @ApiProperty({
    example: 'tok_aprovado',
    description: 'Token simulado: tok_aprovado | tok_recusado | tok_cartao_bloqueado | tok_indisponivel | tok_instavel',
  })
  @IsString()
  @IsNotEmpty({ message: 'tokenPagamento é obrigatório' })
  @MaxLength(100)
  tokenPagamento: string;
}

export class ItemPedidoRespostaDto {
  @ApiProperty({ example: 1 }) produtoId: number;
  @ApiProperty({ example: 'X-Burger' }) nome: string;
  @ApiProperty({ example: 2 }) quantidade: number;
  @ApiProperty({ example: 25.9 }) precoUnitario: number;
  @ApiProperty({ example: 51.8 }) subtotal: number;
}

export class PedidoRespostaDto {
  @ApiProperty({ example: 1 }) pedidoId: number;
  @ApiProperty({ example: 1 }) unidadeId: number;
  @ApiProperty({ example: 6, nullable: true }) clienteId: number | null;
  @ApiProperty({ enum: CanalPedido, example: CanalPedido.TOTEM }) canalPedido: CanalPedido;
  @ApiProperty({ enum: StatusPedido, example: StatusPedido.AGUARDANDO_PAGAMENTO }) status: StatusPedido;
  @ApiProperty({ enum: FormaPagamento, example: FormaPagamento.PIX }) formaPagamento: FormaPagamento;
  @ApiProperty({ type: [ItemPedidoRespostaDto] }) itens: ItemPedidoRespostaDto[];
  @ApiProperty({ example: 64.7 }) subtotal: number;
  @ApiProperty({ example: 6.47 }) descontoPromocao: number;
  @ApiProperty({ example: 0 }) descontoPontos: number;
  @ApiProperty({ example: 58.23 }) total: number;
  @ApiProperty({ example: 'BEMVINDO10', nullable: true }) codigoPromocao: string | null;
  @ApiProperty({ example: 0 }) pontosResgatados: number;
  @ApiProperty({ example: 'Sem cebola', nullable: true }) observacao: string | null;
  @ApiProperty({ example: '2026-02-05T12:00:00.000Z' }) createdAt: string;
  @ApiProperty({ example: '2026-02-05T12:00:00.000Z' }) updatedAt: string;
}

export class PaginaPedidosDto {
  @ApiProperty({ type: [PedidoRespostaDto] }) data: PedidoRespostaDto[];
  @ApiProperty({ type: MetaPaginacao }) meta: MetaPaginacao;
}

export class PagamentoRespostaDto {
  @ApiProperty({ example: 1 }) pagamentoId: number;
  @ApiProperty({ example: 1 }) pedidoId: number;
  @ApiProperty({ example: 'APROVADO', enum: ['PENDENTE', 'APROVADO', 'RECUSADO', 'ERRO', 'ESTORNADO'] }) status: string;
  @ApiProperty({ example: 'PIX' }) metodo: string;
  @ApiProperty({ example: 58.23 }) valor: number;
  @ApiProperty({ example: 'MOCK_GATEWAY' }) provedor: string;
  @ApiProperty({ example: 'mock_7d0f...' }) transacaoExternaId: string;
  @ApiProperty({ example: '00' }) codigoRetorno: string;
  @ApiProperty({ example: 'Transação aprovada' }) mensagem: string;
  @ApiProperty({ example: 1 }) tentativas: number;
  @ApiProperty({ example: { aprovado: true, transacaoId: 'mock_7d0f...', codigo: '00', mensagem: 'Transação aprovada', processadoEm: '2026-02-05T12:00:01.000Z' } })
  respostaGateway: object;
  @ApiProperty({ example: 'EM_PREPARO' }) statusPedido: string;
  @ApiProperty({ example: 58 }) pontosAcumulados: number;
}
