// Onda 9 — Plano de um tick (application): converte o resultado puro da máquina de fases nas linhas a
// persistir — a narração (append-only, ≤1) e o patch do watch (fase + cursores). Sem I/O aqui.

import { tickWatch, type TickResult, type TickSignals, type WatchState } from '../domain/watch.ts';

export interface NexusNarrationRow {
  watch_id: string;
  session_id: string | null;
  text: string;
  kind: 'status' | 'opinion' | 'system';
}

export interface TickPlan {
  result: TickResult;
  narrationRow: NexusNarrationRow | null; // ≤1 por tick
  watchPatch: Record<string, unknown>;
}

export function planTick(args: {
  watchId: string;
  sessionId: string | null;
  state: WatchState;
  signals: TickSignals;
}): TickPlan {
  const result = tickWatch(args.state, args.signals);
  const narrationRow: NexusNarrationRow | null = result.narration
    ? {
        watch_id: args.watchId,
        session_id: args.sessionId,
        text: result.narration.text,
        kind: result.narration.kind,
      }
    : null;
  const watchPatch: Record<string, unknown> = {
    phase: result.nextPhase,
    last_event_ts: result.cursors.last_event_ts,
    last_narrated_milestone: result.cursors.last_narrated_milestone,
  };
  return { result, narrationRow, watchPatch };
}
