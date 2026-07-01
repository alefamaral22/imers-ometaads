import 'server-only';
import { selectRows, insertRows } from '../db/client';
import { clientRowSchema, parseRows, type ClientRow } from '../domain/schemas';
import { scopeEq, type AccountScope } from '../multitenant/scope';
import { writeOperationLog } from './logs';
import type { CreateClientRequest } from '../multitenant/requests';

/**
 * Server-side reads of public.clients. RLS is closed to the browser (ADR 0002). Onda 15: TODA leitura
 * é escopada por account (ADR 0026/0031) — super_admin/socio veem tudo; cliente_usuario só os seus.
 */
export async function listClients(scope: AccountScope): Promise<ClientRow[]> {
  const eq = scopeEq(scope); // null = global (super_admin/socio)
  const rows = await selectRows('clients', { order: 'name.asc', ...(eq ? { eq } : {}) });
  return parseRows(clientRowSchema, rows);
}

/** Busca um cliente por slug DENTRO do escopo — um cliente_usuario não abre o detalhe de outra account. */
export async function getClientBySlug(
  scope: AccountScope,
  slug: string,
): Promise<ClientRow | null> {
  const eq = scopeEq(scope);
  const rows = await selectRows('clients', { eq: { slug, ...(eq ?? {}) }, limit: 1 });
  return parseRows(clientRowSchema, rows)[0] ?? null;
}

/**
 * client_ids da account — escopo das tabelas filhas (campaigns/analyses/landing_pages/logs). `null` =
 * visibilidade global (sem filtro). Lista (possivelmente vazia) = restrito àqueles clientes.
 */
export async function accountClientIds(scope: AccountScope): Promise<string[] | null> {
  const eq = scopeEq(scope);
  if (!eq) return null; // global
  const rows = await selectRows('clients', { select: 'id', eq });
  return rows.map((r) => (r as { id: string }).id);
}

/**
 * Cria um cliente pela UI (super_admin/socio). O cliente nasce na account do criador (das claims da
 * sessão) — nunca de texto livre. Audita a criação. slug duplicado vira erro do PostgREST (unique).
 */
export async function createClient(
  scope: AccountScope,
  input: CreateClientRequest,
): Promise<ClientRow> {
  const row = {
    account_id: scope.accountId,
    slug: input.slug,
    name: input.name,
    daily_budget_cap_cents: input.dailyBudgetCapCents,
    currency: input.currency,
    ...(input.defaultLandingUrl !== undefined && { default_landing_url: input.defaultLandingUrl }),
    ...(input.adAccountId !== undefined && { ad_account_id: input.adAccountId }),
    ...(input.businessManagerId !== undefined && { business_manager_id: input.businessManagerId }),
    ...(input.facebookPageId !== undefined && { facebook_page_id: input.facebookPageId }),
  };
  const inserted = await insertRows('clients', [row]);
  const client = parseRows(clientRowSchema, inserted)[0];
  if (!client) throw new Error('insert clients returned no row');
  await writeOperationLog({
    entityType: 'client',
    entityId: client.id,
    clientId: client.id,
    action: 'create',
    actor: scope.accountId,
    summary: `cliente ${client.slug} cadastrado`,
  }).catch(() => {});
  return client;
}
