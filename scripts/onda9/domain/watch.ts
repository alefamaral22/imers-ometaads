// Onda 9 — Máquina de fases do watch autônomo do Nexus (SPEC §8 Onda 9, ADR 0019). Pura/determinística,
// relógio injetado. Fases: watching → reviewing → notifying → done (+ failed). Garante **≤1 narração por
// tick** e idempotência por cursores (last_narrated_milestone): repetir um tick não duplica narração.

export type WatchPhase = 'watching' | 'reviewing' | 'notifying' | 'done' | 'failed';
export type NarrationKind = 'status' | 'opinion' | 'system';

export type JobStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | null;

export interface WatchState {
  phase: WatchPhase;
  last_event_ts: string | null;
  last_narrated_milestone: string | null;
}

export interface TickSignals {
  jobStatus: JobStatus; // status do job observado
  latestEventTs: string | null; // ts do agent_event mais novo do run
  now: string; // ISO (relógio injetado)
}

export interface Narration {
  text: string;
  kind: NarrationKind;
  milestone: string; // chave de dedup (vira last_narrated_milestone)
}

export interface TickResult {
  nextPhase: WatchPhase;
  narration: Narration | null; // ≤1 por tick
  cursors: { last_event_ts: string | null; last_narrated_milestone: string | null };
}

/**
 * Um tick: avança no máximo uma fase e emite no máximo uma narração. A narração só é emitida se seu
 * `milestone` for diferente do último narrado (idempotência): re-tickar a mesma fase não duplica.
 */
export function tickWatch(state: WatchState, signals: TickSignals): TickResult {
  const lastMilestone = state.last_narrated_milestone;
  const eventCursor = signals.latestEventTs ?? state.last_event_ts;

  // Helper: monta o resultado, emitindo a narração só quando o milestone é novo.
  const result = (
    nextPhase: WatchPhase,
    milestone: string | null,
    text?: string,
    kind: NarrationKind = 'status',
  ): TickResult => {
    const emit = milestone !== null && milestone !== lastMilestone;
    return {
      nextPhase,
      narration: emit ? { text: text ?? '', kind, milestone } : null,
      cursors: {
        last_event_ts: eventCursor,
        last_narrated_milestone: emit ? milestone : lastMilestone,
      },
    };
  };

  switch (state.phase) {
    case 'watching': {
      if (signals.jobStatus === 'completed') {
        return result(
          'reviewing',
          'job-completed',
          'A tarefa terminou. Vou revisar o resultado.',
          'status',
        );
      }
      if (signals.jobStatus === 'failed' || signals.jobStatus === 'cancelled') {
        return result(
          'failed',
          'job-failed',
          'A tarefa falhou — encerrando o acompanhamento.',
          'system',
        );
      }
      // ainda em andamento: narra o início uma única vez.
      return result('watching', 'watch-started', 'Acompanhando a tarefa em andamento…', 'status');
    }
    case 'reviewing':
      return result('notifying', 'reviewed', 'Revisei o resultado: dentro do esperado.', 'opinion');
    case 'notifying':
      return result('done', 'notified', 'Operador notificado. Acompanhamento concluído.', 'system');
    case 'done':
    case 'failed':
      return result(state.phase, null);
    default:
      return result('failed', null);
  }
}

export function isTerminal(phase: WatchPhase): boolean {
  return phase === 'done' || phase === 'failed';
}
