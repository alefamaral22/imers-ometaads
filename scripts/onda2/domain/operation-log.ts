// Onda 2 — operation_logs (append-only; uma linha por mutação). Sem PII; só specs de campanha.

export type OperationAction = 'create' | 'update' | 'delete' | 'activate' | 'pause';

export interface OperationLogRow {
  client_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: OperationAction;
  actor: string;
  summary: string;
  payload: unknown;
}

export function buildOperationLog(args: {
  clientId: string | null;
  entityType: string;
  entityId: string | null;
  action: OperationAction;
  actor: string;
  summary: string;
  payload?: unknown;
}): OperationLogRow {
  return {
    client_id: args.clientId,
    entity_type: args.entityType,
    entity_id: args.entityId,
    action: args.action,
    actor: args.actor,
    summary: args.summary,
    payload: args.payload ?? null,
  };
}
