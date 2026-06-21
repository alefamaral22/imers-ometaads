import 'server-only';
import { selectRows } from '../db/client';
import {
  analysisRowSchema,
  funnelEventRowSchema,
  parseRows,
  type AnalysisRow,
  type FunnelEventRow,
} from '../domain/schemas';

export async function listAnalyses(limit = 100): Promise<AnalysisRow[]> {
  const rows = await selectRows('analyses', { order: 'created_at.desc', limit });
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

export async function getLatestAnalysis(): Promise<AnalysisRow | null> {
  const rows = await selectRows('analyses', { order: 'created_at.desc', limit: 1 });
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
