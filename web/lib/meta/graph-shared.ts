/**
 * Constantes e tipos de erro compartilhados da Meta Graph API. Vive separado de `graph-client.ts`
 * PORQUE aquele é `server-only`: módulos puros/testáveis (ex.: `oauth.ts`) precisam da versão da API e
 * da classe de erro sem arrastar a barreira de servidor para o ambiente de teste.
 */

export const META_GRAPH_API_VERSION = 'v21.0' as const;

export class MetaGraphError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'MetaGraphError';
  }
}
