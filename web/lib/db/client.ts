import 'server-only';
import { serverEnv } from '../env';

/**
 * Server-only Supabase data client. Reads go through the PostgREST endpoint using the
 * SUPABASE_SECRET_KEY (service_role) — RLS is deny-by-default and closed to the browser, so
 * EVERY table read happens here, server-side (SPEC-000 §11, ADR 0002). The `server-only` import
 * makes the build fail if this module is ever pulled into a Client Component.
 */

export interface SelectOptions {
  /** PostgREST `select=` column projection. Defaults to `*`. */
  select?: string;
  /** Equality filters: { column: value } -> `column=eq.value`. */
  eq?: Record<string, string>;
  /** `in` filter: { column: [values] } -> `column=in.(a,b)`. */
  in?: Record<string, readonly string[]>;
  /** Ordering, e.g. "created_at.desc". */
  order?: string;
  limit?: number;
}

function buildQuery(options: SelectOptions): string {
  const params = new URLSearchParams();
  params.set('select', options.select ?? '*');
  for (const [col, value] of Object.entries(options.eq ?? {})) {
    params.append(col, `eq.${value}`);
  }
  for (const [col, values] of Object.entries(options.in ?? {})) {
    params.append(col, `in.(${values.join(',')})`);
  }
  if (options.order) params.set('order', options.order);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  return params.toString();
}

// Exported for unit testing the query string assembly without any network.
export { buildQuery };

async function restRequest(path: string, init: RequestInit): Promise<unknown> {
  const env = serverEnv();
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    // Dashboard reads are request-time; never cache service_role responses.
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase REST ${res.status} on ${path}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

/** Read rows from a table/view. Returns the raw JSON array (validated by the caller's schema). */
export async function selectRows(table: string, options: SelectOptions = {}): Promise<unknown[]> {
  const query = buildQuery(options);
  const json = await restRequest(`${table}?${query}`, { method: 'GET' });
  return Array.isArray(json) ? json : [];
}

/** Insert rows (used by the API to enqueue jobs in a later wave; kept minimal here). */
export async function insertRows(table: string, rows: unknown[]): Promise<unknown[]> {
  const json = await restRequest(table, {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
  return Array.isArray(json) ? json : [];
}
