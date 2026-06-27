/**
 * Onda 9 — Editor de landing page (lógica pura). Edições de RASCUNHO são síncronas e validadas por
 * schema na fronteira (SPEC §11); a publicação é um job pesado (Onda 8). A concorrência usa versão
 * otimista (`reconcile`) e o `edit-path` aplica uma alteração pontual num campo. Sem I/O.
 */

import { z } from 'zod';

// Catálogo de seções (espelha landing_page_sections.type e @template/lp-render SECTION_TYPES).
export const SECTION_TYPES = [
  'hero',
  'logos',
  'problem',
  'solution',
  'features',
  'benefits',
  'how_it_works',
  'testimonials',
  'video',
  'pricing',
  'offer',
  'faq',
  'guarantee',
  'about',
  'lead_form',
  'urgency',
  'footer',
] as const;

// edit-path: só letras/dígitos/_ separados por ponto (ex.: "cta.label", "features.0.title"). Sem
// `__proto__`/`prototype`/`constructor` (anti prototype-pollution).
const SAFE_SEGMENT = /^[A-Za-z0-9_]+$/;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

export const editSectionSchema = z.object({
  landing_page_id: z.string().uuid(),
  type: z.enum(SECTION_TYPES),
  // Caminho pontual dentro de `fields` (ex.: "headline", "cta.label").
  path: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/, 'edit-path inválido'),
  // Valor primitivo (string/number/boolean) — edição pontual de rascunho.
  value: z.union([z.string().max(4000), z.number(), z.boolean()]),
  // Concorrência otimista: versão que o cliente acha que está editando.
  expectedVersion: z.number().int().positive(),
});

export type EditSectionInput = z.infer<typeof editSectionSchema>;

// Slug canônico (cliente/produto/subdomínio): minúsculas, dígitos e hífen entre segmentos. Charset
// estreito de propósito — o valor vai virar arg de um job (entrada externa é DADO, não instrução).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Pedido (operador) de criação de uma landing page a partir da aba. Só enfileira o job de criação
// (escrita = só enfileira); a skill headless faz o trabalho. client_slug é obrigatório; o resto opcional.
export const createLandingSchema = z.object({
  client_slug: z.string().min(1).max(80).regex(SLUG_RE, 'slug inválido'),
  product_slug: z.string().min(1).max(80).regex(SLUG_RE, 'slug inválido').optional(),
  subdomain: z.string().min(1).max(63).regex(SLUG_RE, 'subdomínio inválido').optional(),
});

export type CreateLandingInput = z.infer<typeof createLandingSchema>;

export const startWatchSchema = z.object({
  target_kind: z.enum(['agent_job', 'landing_page']),
  target_id: z.string().uuid(),
  agent_job_id: z.string().uuid().optional(),
  session_id: z.string().min(1).max(120),
  client_id: z.string().uuid().optional(),
});

export type StartWatchInput = z.infer<typeof startWatchSchema>;

/** Concorrência otimista: a edição só vale se a versão atual bate com a esperada pelo cliente. */
export function reconcile(currentVersion: number, expectedVersion: number): boolean {
  return Number.isInteger(currentVersion) && currentVersion === expectedVersion;
}

export function nextVersion(currentVersion: number): number {
  return currentVersion + 1;
}

/**
 * Aplica uma alteração pontual num objeto de fields seguindo um edit-path validado. Retorna um NOVO
 * objeto (imutável); rejeita segmentos perigosos (prototype pollution). Cria objetos intermediários.
 */
export function applyEditPath(
  fields: Record<string, unknown>,
  path: string,
  value: string | number | boolean,
): Record<string, unknown> {
  const segments = path.split('.');
  for (const seg of segments) {
    if (!SAFE_SEGMENT.test(seg) || FORBIDDEN.has(seg)) {
      throw new Error(`unsafe edit-path segment: ${seg}`);
    }
  }
  const root: Record<string, unknown> = structuredCloneSafe(fields);
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i] as string;
    const child = cursor[key];
    if (child === null || typeof child !== 'object' || Array.isArray(child)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1] as string] = value;
  return root;
}

function structuredCloneSafe(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}
