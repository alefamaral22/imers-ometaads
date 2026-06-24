import 'server-only';
import { selectRows } from '../db/client';
import {
  analysisRowSchema,
  funnelEventRowSchema,
  parseRows,
  type AnalysisRow,
  type FunnelEventRow,
} from '../domain/schemas';
import { clientScopeFilter, type AccountScope } from '../multitenant/scope';
import { accountClientIds } from './clients';

/** Análises da agência escopadas por account (Onda 15). */
export async function listAnalyses(scope: AccountScope, limit = 100): Promise<AnalysisRow[]> {
  const filter = clientScopeFilter(await accountClientIds(scope));
  if (filter.kind === 'none') return [];
  const rows = await selectRows('analyses', {
    order: 'created_at.desc',
    limit,
    ...(filter.kind === 'in' ? { in: { client_id: filter.clientIds } } : {}),
  });
  return parseRows(analysisRowSchema, rows);
}

export async function listAnalysesByClient(clientId: string, limit = 50): Promise<AnalysisRow[]> {
  const rows = await selectRows('analyses', {
    eq: { client_id: clientId },
    order: 'created_at.desc',
    limit,
  });
  return parseRows(analysisRowSchema, rows);
}

export async function getLatestAnalysis(scope: AccountScope): Promise<AnalysisRow | null> {
  const filter = clientScopeFilter(await accountClientIds(scope));
  if (filter.kind === 'none') return null;
  const rows = await selectRows('analyses', {
    order: 'created_at.desc',
    limit: 1,
    ...(filter.kind === 'in' ? { in: { client_id: filter.clientIds } } : {}),
  });
  return parseRows(analysisRowSchema, rows)[0] ?? null;
}

/** Funnel events for one analysis, ordered by the canonical 7-step order. */
export async function listFunnelEvents(analysisId: string): Promise<FunnelEventRow[]> {
  const rows = await selectRows('funnel_events', {
    eq: { analysis_id: analysisId },
    order: 'step_order.asc',
  });
  return parseRows(funnelEventRowSchema, rows);
}
