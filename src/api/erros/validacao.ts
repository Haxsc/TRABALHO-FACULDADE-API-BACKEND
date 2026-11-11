import { ValidationError, ValidationPipe } from '@nestjs/common';
import { DetalheErro, ErroDeDominio } from '../../domain/erros';

// itens.0.quantidade -> itens[0].quantidade
function caminho(pai: string, prop: string): string {
  if (/^\d+$/.test(prop)) return `${pai}[${prop}]`;
  return pai ? `${pai}.${prop}` : prop;
}

function achatar(erros: ValidationError[], pai = ''): DetalheErro[] {
  return erros.flatMap((e) => {
    const campo = caminho(pai, e.property);
    const proprios = Object.values(e.constraints ?? {}).map((issue) => ({ field: campo, issue }));
    return [...proprios, ...achatar(e.children ?? [], campo)];
  });
}

export function criarValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (erros) =>
      new ErroDeDominio('VALIDACAO', 'Um ou mais campos são inválidos.', 422, achatar(erros)),
  });
}
