import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { DetalheErro, ErroDeDominio } from '../../domain/erros';
import { ContextoAtual } from '../../infrastructure/contexto/contexto-requisicao';

export interface CorpoErro {
  error: string;
  message: string;
  details: DetalheErro[];
  timestamp: string;
  path: string;
  requestId?: string;
}

const CODIGOS_HTTP: Record<number, string> = {
  400: 'REQUISICAO_INVALIDA',
  401: 'NAO_AUTENTICADO',
  403: 'ACESSO_NEGADO',
  404: 'RECURSO_NAO_ENCONTRADO',
  405: 'METODO_NAO_PERMITIDO',
  409: 'CONFLITO',
  413: 'PAYLOAD_MUITO_GRANDE',
  415: 'TIPO_DE_CONTEUDO_INVALIDO',
  422: 'VALIDACAO',
  429: 'MUITAS_REQUISICOES',
};

@Catch()
export class FiltroErros implements ExceptionFilter {
  private readonly logger = new Logger('Erros');

  catch(excecao: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { status, error, message, details } = this.traduzir(excecao);

    if (status >= 500 && !(excecao instanceof ErroDeDominio)) {
      this.logger.error(`${req.method} ${req.originalUrl} -> ${status}`, excecao instanceof Error ? excecao.stack : String(excecao));
    } else if (status >= 500) {
      this.logger.warn(`${req.method} ${req.originalUrl} -> ${status} ${error}`);
    }

    const corpo: CorpoErro = {
      error,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: req.originalUrl.split('?')[0],
      requestId: ContextoAtual.obter()?.requestId,
    };
    res.status(status).json(corpo);
  }

  private traduzir(e: unknown): { status: number; error: string; message: string; details: DetalheErro[] } {
    if (e instanceof ErroDeDominio) {
      return { status: e.statusHttp, error: e.codigo, message: e.message, details: e.detalhes };
    }

    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { status: 409, error: 'REGISTRO_DUPLICADO', message: 'Já existe um registro com estes dados.', details: [] };
    }

    if (e instanceof HttpException) {
      const status = e.getStatus();
      const resposta = e.getResponse() as { message?: string | string[] } | string;
      let message = typeof resposta === 'string' ? resposta : (resposta.message ?? e.message);
      if (Array.isArray(message)) message = message.join('; ');

      // body com JSON mal formado chega como 400 do body-parser
      if (status === 400 && /JSON/i.test(String(message))) {
        return { status, error: 'JSON_INVALIDO', message: 'O corpo da requisição não é um JSON válido.', details: [] };
      }
      if (status === 404) message = 'Rota não encontrada.';
      if (status === 429) message = 'Muitas tentativas. Aguarde um momento e tente novamente.';

      return { status, error: CODIGOS_HTTP[status] ?? 'ERRO_HTTP', message: String(message), details: [] };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'ERRO_INTERNO',
      message: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
      details: [],
    };
  }
}
