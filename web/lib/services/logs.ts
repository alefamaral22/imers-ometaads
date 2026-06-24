import 'server-only';
import { selectRows, insertRows } from '../db/client';
import {
  dailySummaryRowSchema,
  operationLogRowSchema,
  parseRows,
  type DailySummaryRow,
  type OperationLogRow,
} from '../domain/schemas';

export interface OperationLogInput {
  entityType: string;
  action: 'create' | 'update' | 'delete' | 'activate' | 'pause';
  entityId?: string | null;
  actor?: string | null;
  summary?: string | null;
  clientId?: string | null;
}

/** Append em operation_logs (trilha de auditoria). Best-effort: o caller decide se ignora a falha. */
export async function writeOperationLog(input: OperationLogInput): Promise<void> {
  await insertRows('operation_logs', [
    {
      client_id: input.clientId ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      actor: input.actor ?? null,
      summary: input.summary ?? null,
    },
  ]);
}

export async function listOperationLogs(limit = 100): Promise<OperationLogRow[]> {
  const rows = await selectRows('operation_logs', { order: 'created_at.desc', limit });
  return parseRows(operationLogRowSchema, rows);
}

export async function listOperationLogsByClient(
  clientId: string,
  limit = 50,
): Promise<OperationLogRow[]> {
  const rows = await selectRows('operation_logs', {
    eq: { client_id: clientId },
    order: 'created_at.desc',
    limit,
  });
  return parseRows(operationLogRowSchema, rows);
}

export async function listDailySummaries(limit = 30): Promise<DailySummaryRow[]> {
  const rows = await selectRows('daily_summaries', { order: 'summary_date.desc', limit });
  return parseRows(dailySummaryRowSchema, rows);
}
