/**
 * Nexus — allowlist server-side slug→skill (SPEC-000 §10). O nome da skill que vai para a fila NUNCA
 * vem de texto livre do modelo/usuário: o Nexus só conhece SLUGS canônicos; o servidor os resolve
 * para o nome real da skill e o `kind` da fila. Slug desconhecido → null (deny). Pura, sem I/O.
 */

// kinds válidos = enum public.job_kind (migration da Onda 1).
export type JobKind =
  | 'create'
  | 'create_sales'
  | 'activate'
  | 'analyze'
  | 'summarize'
  | 'landing'
  | 'landing_publish'
  | 'landing_edit'
  | 'snapshot';

export interface ResolvedSkill {
  slug: JobSlug;
  skill: string;
  kind: JobKind;
}

// Mapa fechado slug → { skill real, kind }. Para personalizar o cliente, troque o sufixo aqui — o
// modelo continua falando só pelo slug. (Template: cliente-exemplo.)
export const JOB_SLUGS = {
  'create-traffic': { skill: 'create-traffic-cliente-exemplo-campaign', kind: 'create' },
  'create-sales': { skill: 'create-sales-cliente-exemplo-campaign', kind: 'create_sales' },
  activate: { skill: 'activate-campaign-cliente-exemplo', kind: 'activate' },
  analyze: { skill: 'funnel-analytics-cliente-exemplo-campaign', kind: 'analyze' },
  summarize: { skill: 'daily-summary-cliente-exemplo', kind: 'summarize' },
  'create-landing': { skill: 'create-landing-page-cliente-exemplo', kind: 'landing' },
  'publish-landing': { skill: 'publish-landing-page-cliente-exemplo', kind: 'landing_publish' },
  // Read-only: raio-x ao vivo das campanhas (métricas + alertas). Não muta a Meta, não gasta.
  'live-snapshot': { skill: 'live-snapshot-cliente-exemplo', kind: 'snapshot' },
} as const satisfies Record<string, { skill: string; kind: JobKind }>;

export type JobSlug = keyof typeof JOB_SLUGS;

/** Resolve um slug para a skill/kind reais. Texto livre / slug desconhecido → null (deny-by-default). */
export function resolveJobSlug(slug: string): ResolvedSkill | null {
  if (!Object.prototype.hasOwnProperty.call(JOB_SLUGS, slug)) return null;
  const entry = JOB_SLUGS[slug as JobSlug];
  return { slug: slug as JobSlug, skill: entry.skill, kind: entry.kind };
}

export function listJobSlugs(): JobSlug[] {
  return Object.keys(JOB_SLUGS) as JobSlug[];
}
