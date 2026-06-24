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

/**
 * Onda 14 — provisionamento de accounts pelo super_admin. `role` aceita SÓ socio/cliente_usuario
 * (anti-escalada: a UI nunca cria super_admin). A senha só transita aqui para virar hash scrypt.
 */
export const createAccountSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/,
      'slug inválido (a–z, 0–9 e hífen; 2–40 chars)',
    ),
  name: z.string().trim().min(2).max(120),
  role: z.enum(['socio', 'cliente_usuario']),
  plan: z.enum(['trial', 'starter', 'pro', 'agency']).default('trial'),
  email: z.string().email().max(256),
  password: z.string().min(8).max(256),
});
export type CreateAccountRequest = z.infer<typeof createAccountSchema>;

export const setAccountActiveSchema = z.object({ isActive: z.boolean() });
export type SetAccountActiveRequest = z.infer<typeof setAccountActiveSchema>;
