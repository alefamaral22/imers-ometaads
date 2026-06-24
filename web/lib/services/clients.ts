import 'server-only';
import { selectRows } from '../db/client';
import { clientRowSchema, parseRows, type ClientRow } from '../domain/schemas';
import { scopeEq, type AccountScope } from '../multitenant/scope';

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
