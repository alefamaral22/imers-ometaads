// Onda 3 — Modelo do job claimado e as transições de status (pending→running→completed/failed).
// Lógica pura: dada a linha do banco e o exit code, produz o corpo do PATCH. Testável sem I/O.

import { RunnerError, requireObject, requireString } from './validation.ts';

export type JobStatus = 'pending' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ClaimedJob {
  id: string;
  skill: string;
  kind: string;
  args: Record<string, unknown>;
}

/** Faz o parse da linha retornada por claim_agent_job (ou null quando não há job pendente). */
export function parseClaimedJob(value: unknown): ClaimedJob | null {
  if (value === null || value === undefined) return null;
  const obj = requireObject(value, 'job');
  const args = obj.args;
  return {
    id: requireString(obj.id, 'job.id'),
    skill: requireString(obj.skill, 'job.skill'),
    kind: requireString(obj.kind, 'job.kind'),
    args:
      args && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {},
  };
}

/** Exit code do `claude -p` → status terminal do job. 0 = completed; qualquer outro = failed. */
export function exitCodeToStatus(exitCode: number): Extract<JobStatus, 'completed' | 'failed'> {
  if (!Number.isInteger(exitCode)) throw new RunnerError(`invalid exit code: ${exitCode}`);
  return exitCode === 0 ? 'completed' : 'failed';
}

/** PATCH que move claimed→running (marca started_at). `now` é injetável (relógio determinístico). */
export function runningPatch(now: string): Record<string, unknown> {
  return { status: 'running', started_at: now };
}

/**
 * PATCH terminal (running→completed/failed) com exit_code e finished_at. `error` é truncado e nunca
 * carrega segredo/PII (vem só do stderr resumido do runner, não do conteúdo da skill).
 */
export function finishedPatch(
  exitCode: number,
  now: string,
  error?: string,
): Record<string, unknown> {
  const status = exitCodeToStatus(exitCode);
  const patch: Record<string, unknown> = {
    status,
    exit_code: exitCode,
    finished_at: now,
  };
  if (status === 'failed') patch.error = (error ?? 'skill failed').slice(0, 2000);
  return patch;
}
