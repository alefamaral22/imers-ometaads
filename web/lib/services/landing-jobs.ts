import 'server-only';
import { buildPendingAction } from '../nexus/domain/confirmation';
import { buildAgentJobRow } from '../nexus/domain/enqueue';
import { enqueueJob, type EnqueueResult } from '../nexus/infra/agent-jobs';
import { getClientBySlug } from './clients';
import type { AccountScope } from '../multitenant/scope';
import type { CreateLandingInput } from '../landing/edit';

/**
 * Enfileira o job de CRIAÇÃO de uma landing page pedido pelo operador na aba (não pelo Trafegante).
 * Reusa a allowlist server-side (slug 'create-landing' → skill/kind reais) e o montador de linha da
 * fila — o nome da skill nunca vem de texto livre. Escrita = só enfileira: a skill headless cria o
 * rascunho (noindex) e encadeia o publish. A idempotência é estrutural (índice único parcial por
 * client_id,kind), então re-pedir com um job ativo devolve `already_active` em vez de duplicar.
 */
export async function enqueueCreateLandingJob(
  scope: AccountScope,
  input: CreateLandingInput,
): Promise<EnqueueResult> {
  const args: Record<string, string> = { client_slug: input.client_slug };
  if (input.product_slug) args.product_slug = input.product_slug;
  if (input.subdomain) args.subdomain = input.subdomain;

  const pending = buildPendingAction('create-landing', args, {
    id: globalThis.crypto.randomUUID(),
  });
  // Slug fixo da allowlist — só falha se a allowlist mudar; nunca por entrada do operador.
  if (pending === null) throw new Error('create-landing slug não resolvido');

  const clientId = (await getClientBySlug(scope, input.client_slug))?.id ?? null;
  return enqueueJob(buildAgentJobRow(clientId, pending));
}
