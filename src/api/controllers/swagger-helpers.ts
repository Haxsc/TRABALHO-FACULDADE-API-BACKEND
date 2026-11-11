import { applyDecorators, ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErroDeDominio } from '../../domain/erros';
import { ErroDto } from '../dtos/comum.dto';

const DESCRICOES: Record<number, string> = {
  400: 'Requisição mal formada (JSON ou parâmetro inválido)',
  401: 'Token ausente, inválido ou expirado',
  403: 'Perfil sem permissão para a operação/unidade',
  404: 'Recurso não encontrado',
  409: 'Conflito com regra de negócio',
  422: 'Erro de validação dos campos',
  429: 'Limite de tentativas excedido',
  503: 'Serviço externo (gateway de pagamento) indisponível',
};

export const RespostasErro = (...codigos: number[]) =>
  applyDecorators(
    ...codigos.map((status) => ApiResponse({ status, description: DESCRICOES[status], type: ErroDto })),
  );

@Injectable()
export class IdPipe implements PipeTransform<string, number> {
  transform(valor: string, meta: ArgumentMetadata): number {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1) {
      throw new ErroDeDominio('PARAMETRO_INVALIDO', `O parâmetro ${meta.data ?? 'id'} deve ser um inteiro positivo.`, 400, [
        { field: meta.data ?? 'id', issue: `Valor recebido: ${valor}` },
      ]);
    }
    return n;
  }
}
