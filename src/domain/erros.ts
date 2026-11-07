export interface DetalheErro {
  field?: string;
  issue: string;
}

export class ErroDeDominio extends Error {
  constructor(
    public readonly codigo: string,
    mensagem: string,
    public readonly statusHttp: number,
    public readonly detalhes: DetalheErro[] = [],
  ) {
    super(mensagem);
  }
}

export class RecursoNaoEncontrado extends ErroDeDominio {
  constructor(codigo: string, mensagem: string, detalhes: DetalheErro[] = []) {
    super(codigo, mensagem, 404, detalhes);
  }
}

export class ConflitoDeRegra extends ErroDeDominio {
  constructor(codigo: string, mensagem: string, detalhes: DetalheErro[] = []) {
    super(codigo, mensagem, 409, detalhes);
  }
}

export class ValidacaoDeNegocio extends ErroDeDominio {
  constructor(codigo: string, mensagem: string, detalhes: DetalheErro[] = []) {
    super(codigo, mensagem, 422, detalhes);
  }
}

export class NaoAutenticado extends ErroDeDominio {
  constructor(codigo = 'NAO_AUTENTICADO', mensagem = 'Autenticação necessária.') {
    super(codigo, mensagem, 401);
  }
}

export class AcessoNegado extends ErroDeDominio {
  constructor(mensagem = 'Seu perfil não tem permissão para esta operação.', codigo = 'ACESSO_NEGADO') {
    super(codigo, mensagem, 403);
  }
}

export class FalhaIntegracao extends ErroDeDominio {
  constructor(codigo: string, mensagem: string, detalhes: DetalheErro[] = []) {
    super(codigo, mensagem, 503, detalhes);
  }
}
