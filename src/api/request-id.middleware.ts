import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { ContextoAtual } from '../infrastructure/contexto/contexto-requisicao';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const recebido = req.header('x-request-id');
    const requestId = recebido && recebido.length <= 64 ? recebido : randomUUID();
    res.setHeader('x-request-id', requestId);
    ContextoAtual.executar({ requestId, ip: req.ip }, () => next());
  }
}
