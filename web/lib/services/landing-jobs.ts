import 'server-only';
import { buildPendingAction } from '../nexus/domain/confirmation';
import { buildAgentJobRow } from '../nexus/domain/enqueue';
import { enqueueJob, type EnqueueResult } from '../nexus/infra/agent-jobs';
import { getClientBySlug } from './clients';
import { listProducts } from './products';
import type { AccountScope } from '../multitenant/scope';
import type { CreateLandingInput } from '../landing/edit';

/**
 * Resultado do enfileiramento de uma criação de LP. Além dos estados normais da fila, um pedido para
 * um cliente/produto que não existe é REJEITADO aqui (não vira job) — mata o falso-verde em que um job
 * para cliente inexistente rodava, não achava nada e "completava" sem criar a LP.
 */
export type CreateLandingOutcome =
  | EnqueueResult
  | { status: 'client_not_found'; jobId: null }
  | { status: 'product_not_found'; jobId: null };

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
): Promise<CreateLandingOutcome> {
  // O cliente precisa existir DENTRO do escopo do chamador — senão o job rodaria à toa (falso-verde).
  const client = await getClientBySlug(scope, input.client_slug);
  if (!client) return { status: 'client_not_found', jobId: null };

  // Se um produto foi informado, ele precisa existir para o cliente (a skill lê o brief dele).
  if (input.product_slug) {
    const products = await listProducts(client.id);
    if (!products.some((p) => p.slug === input.product_slug)) {
      return { status: 'product_not_found', jobId: null };
    }
  }

  const args: Record<string, string> = { client_slug: input.client_slug };
  if (input.product_slug) args.product_slug = input.product_slug;
  if (input.subdomain) args.subdomain = input.subdomain;
  if (input.inputs_token) args.inputs_token = input.inputs_token;

  const pending = buildPendingAction('create-landing', args, {
    id: globalThis.crypto.randomUUID(),
  });
  // Slug fixo da allowlist — só falha se a allowlist mudar; nunca por entrada do operador.
  if (pending === null) throw new Error('create-landing slug não resolvido');

  return enqueueJob(buildAgentJobRow(client.id, pending));
}
