import { z } from 'zod';

/**
 * Onda 12 — schemas de fronteira das mutações do cofre (validação por schema tipado; entrada externa
 * é dado, não instrução). O token/chave em texto puro só transita aqui para ser cifrado server-side.
 */
export const createConnectionSchema = z.object({
  accountId: z.string().uuid(),
  metaAdAccountId: z
    .string()
    .trim()
    .regex(/^(act_)?\d{1,20}$/, 'meta ad account id inválido (use act_<digits> ou <digits>)'),
  token: z.string().min(20).max(500),
  tokenLabel: z.string().trim().max(120).optional(),
  clientId: z.string().uuid().optional(),
});
export type CreateConnectionRequest = z.infer<typeof createConnectionSchema>;

export const upsertApiKeySchema = z.object({
  accountId: z.string().uuid(),
  provider: z.enum(['anthropic', 'openai', 'elevenlabs', 'minimax', 'other']),
  key: z.string().min(10).max(500),
  label: z.string().trim().max(120).optional(),
});
export type UpsertApiKeyRequest = z.infer<typeof upsertApiKeySchema>;
