/**
 * Nexus — validação dos args do job (SPEC-000 §10: "args com charset restrito"). A fala/tela é
 * conteúdo NÃO confiável (prompt injection): aqui tratamos como DADO. Só chaves de uma allowlist e
 * valores com charset seguro (sem metacaracteres de shell, sem espaço-controle) passam. Pura.
 */

import { z } from 'zod';

// Charset seguro: letras/números/_-.:/@ e espaço. Sem ; | & $ ` ( ) < > etc. Máx 200 chars.
export const ARG_VALUE_RE = /^[\w\-.:/@ ]{0,200}$/u;

// Chaves aceitas nos args de um job. Qualquer outra chave é rejeitada (deny-by-default).
export const ALLOWED_ARG_KEYS = [
  'client_slug',
  'product_slug',
  'campaign_id',
  'landing_page_id',
  'subdomain',
  'period', // janela do snapshot ao vivo (ex.: last_7d, last_30d) — Onda 16
  'inputs_token', // UUID dos inputs opcionais (imagens/copy) no Storage — lido pela skill de LP
] as const;

export type AllowedArgKey = (typeof ALLOWED_ARG_KEYS)[number];

const argValue = z
  .string()
  .max(200)
  .regex(ARG_VALUE_RE, 'valor com caractere não permitido (charset restrito)');

// Objeto de args: chaves da allowlist, valores no charset seguro. `.strict()` rejeita chave extra.
export const jobArgsSchema = z
  .object(
    Object.fromEntries(ALLOWED_ARG_KEYS.map((k) => [k, argValue.optional()])) as Record<
      AllowedArgKey,
      z.ZodOptional<typeof argValue>
    >,
  )
  .strict();

export type JobArgs = z.infer<typeof jobArgsSchema>;

/** Valida e normaliza os args. Lança em chave/valor inválidos (entrada externa é dado, não instrução). */
export function parseJobArgs(raw: unknown): JobArgs {
  const obj = raw == null ? {} : raw;
  return jobArgsSchema.parse(obj);
}

/** Compacta os args para um Record<string,string> (descarta chaves ausentes) — pronto para persistir. */
export function compactArgs(args: JobArgs): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ALLOWED_ARG_KEYS) {
    const value = args[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
