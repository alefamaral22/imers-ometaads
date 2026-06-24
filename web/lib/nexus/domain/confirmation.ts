/**
 * Nexus — confirmação em dois turnos (SPEC-000 §10). Toda tool de ESCRITA não age: ela PROPÕE uma
 * ação pendente (turno 1). A execução (enfileirar o job) só ocorre quando chega uma confirmação
 * explícita que cita o `id` exato da pendência (turno 2) — não existe `confirm=true` livre. Pura.
 */

import { resolveJobSlug, type JobKind, type JobSlug } from './allowlist';
import { parseJobArgs, type JobArgs } from './args';

export interface PendingAction {
  id: string; // token opaco que o turno 2 deve citar para confirmar
  slug: JobSlug;
  skill: string;
  kind: JobKind;
  args: JobArgs;
  summary: string; // frase legível para o operador confirmar ("Vou criar campanha de tráfego…")
}

const HUMAN: Record<JobKind, string> = {
  create: 'criar uma campanha de tráfego (PAUSED)',
  create_sales: 'criar uma campanha de vendas (PAUSED)',
  activate: 'ATIVAR uma campanha (liga gasto real)',
  analyze: 'rodar a análise de funil',
  summarize: 'gerar o resumo diário',
  landing: 'criar uma landing page (rascunho)',
  landing_publish: 'publicar uma landing page',
  landing_edit: 'editar uma landing page',
  // read-only (perna leve do híbrido): não passa por confirmação, mas o kind precisa de rótulo.
  snapshot: 'puxar um raio-x ao vivo das campanhas',
};

/**
 * Constrói a ação pendente a partir de um slug e args crus. Valida slug (allowlist) e args (charset).
 * Slug desconhecido → null (deny). NÃO enfileira nada — só descreve o que será feito no turno 2.
 */
export function buildPendingAction(
  slug: string,
  argsRaw: unknown,
  opts: { id: string },
): PendingAction | null {
  const resolved = resolveJobSlug(slug);
  if (resolved === null) return null;
  const args = parseJobArgs(argsRaw);
  const target = args.client_slug ?? args.campaign_id ?? args.subdomain ?? 'cliente-exemplo';
  return {
    id: opts.id,
    slug: resolved.slug,
    skill: resolved.skill,
    kind: resolved.kind,
    args,
    summary: `Posso ${HUMAN[resolved.kind]} para ${target}?`,
  };
}

/**
 * Decide se uma confirmação recebida no turno 2 libera a pendência. Exige igualdade exata do id
 * (token), evitando que um "sim" solto ou injeção dispare a ação. Tempo-constante no comprimento.
 */
export function isConfirmation(pending: PendingAction, confirmId: unknown): boolean {
  if (typeof confirmId !== 'string' || confirmId.length === 0) return false;
  if (confirmId.length !== pending.id.length) return false;
  let diff = 0;
  for (let i = 0; i < confirmId.length; i++) {
    diff |= confirmId.charCodeAt(i) ^ pending.id.charCodeAt(i);
  }
  return diff === 0;
}
