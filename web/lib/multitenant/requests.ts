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

/**
 * Onda A — planos configuráveis. Money em centavos int; limites null = ilimitado. `features` é um
 * objeto de flags curado (dado, não instrução). slug canônico como o das accounts.
 */
const planSlugField = z
  .string()
  .trim()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'slug inválido (a–z, 0–9 e hífen; 2–40 chars)');
const nullableLimit = z.number().int().nonnegative().max(1_000_000).nullable();

export const createPlanSchema = z.object({
  slug: planSlugField,
  name: z.string().trim().min(2).max(120),
  priceCents: z.number().int().nonnegative().max(100_000_000).default(0),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'moeda inválida (ISO 4217, ex.: BRL)')
    .default('BRL'),
  trialDays: z.number().int().nonnegative().max(365).default(0),
  maxClients: nullableLimit.default(null),
  maxLandingPages: nullableLimit.default(null),
  maxCampaigns: nullableLimit.default(null),
  maxUsers: nullableLimit.default(null),
  features: z.record(z.string(), z.unknown()).default({}),
  sortOrder: z.number().int().nonnegative().max(10_000).default(0),
});
export type CreatePlanRequest = z.infer<typeof createPlanSchema>;

// Atualização: todos os campos opcionais (patch parcial). is_active permite desativar (soft-delete).
export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    priceCents: z.number().int().nonnegative().max(100_000_000),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, 'moeda inválida (ISO 4217, ex.: BRL)'),
    trialDays: z.number().int().nonnegative().max(365),
    maxClients: nullableLimit,
    maxLandingPages: nullableLimit,
    maxCampaigns: nullableLimit,
    maxUsers: nullableLimit,
    features: z.record(z.string(), z.unknown()),
    sortOrder: z.number().int().nonnegative().max(10_000),
    isActive: z.boolean(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'nada para atualizar');
export type UpdatePlanRequest = z.infer<typeof updatePlanSchema>;

export const assignPlanSchema = z.object({
  planId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});
export type AssignPlanRequest = z.infer<typeof assignPlanSchema>;

// slug canônico: a–z, 0–9 e hífen; 2–40 chars (mesmo formato das accounts).
const slugField = z
  .string()
  .trim()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'slug inválido (a–z, 0–9 e hífen; 2–40 chars)');

// Só https em URLs externas (checkout/site). Nunca data:/javascript: (XSS).
const httpsUrlField = z
  .string()
  .trim()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be an https URL');

const metaIdField = z
  .string()
  .trim()
  .regex(/^(act_)?\d{1,20}$/, 'id da Meta inválido');

/** Cadastro de cliente pela UI (super_admin/socio). Campos Meta opcionais; o token fica em /settings. */
export const createClientSchema = z.object({
  slug: slugField,
  name: z.string().trim().min(2).max(120),
  defaultLandingUrl: httpsUrlField.optional(),
  dailyBudgetCapCents: z.number().int().nonnegative().max(100_000_000).default(5000),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'moeda inválida (ISO 4217, ex.: BRL)')
    .default('BRL'),
  adAccountId: metaIdField.optional(),
  businessManagerId: metaIdField.optional(),
  facebookPageId: z
    .string()
    .trim()
    .regex(/^\d{1,20}$/, 'facebook page id inválido')
    .optional(),
});
export type CreateClientRequest = z.infer<typeof createClientSchema>;

/** Cadastro de produto (brief) de um cliente. O brief é DADO curado, validado por schema na fronteira. */
export const createProductSchema = z.object({
  clientId: z.string().uuid(),
  slug: slugField,
  name: z.string().trim().min(2).max(200),
  audience: z.string().trim().min(2).max(2000),
  valueProps: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  tone: z.string().trim().min(2).max(500),
  landingUrl: httpsUrlField,
  priceCents: z.number().int().nonnegative().max(100_000_000),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'moeda inválida (ISO 4217, ex.: BRL)')
    .default('BRL'),
  defaultSubdomain: slugField.optional(),
});
export type CreateProductRequest = z.infer<typeof createProductSchema>;
