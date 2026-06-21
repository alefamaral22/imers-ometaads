// Onda 9 — Um tick do modo autônomo: claim de 1 watch ativo → lê status do job + último evento →
// decide (planTick, puro/testado) → insere ≤1 narração e patcha a fase/cursores. Mecânico (sem LLM):
// a decisão é determinística. Idempotente por cursores. Chamado pelo poll-autonomous-watches.sh.

import { readRunnerConfig } from './infrastructure/supabase.ts';
import {
  claimAutonomousWatch,
  getJobStatus,
  getLatestEventTs,
  insertNarration,
  patchWatch,
} from './infrastructure/watches.ts';
import { planTick } from '../onda9/application/tick-plan.ts';
import type { JobStatus, WatchPhase } from '../onda9/domain/watch.ts';

async function main(): Promise<void> {
  const cfg = readRunnerConfig();
  const watch = await claimAutonomousWatch(cfg);
  if (watch === null) {
    console.log('poll-watch-once: no active watch');
    return;
  }

  const jobId = watch.agent_job_id;
  const jobStatus: JobStatus = jobId ? ((await getJobStatus(cfg, jobId)) as JobStatus) : null;
  const latestEventTs = jobId ? await getLatestEventTs(cfg, jobId) : null;

  const plan = planTick({
    watchId: watch.id,
    sessionId: watch.session_id,
    state: {
      phase: watch.phase as WatchPhase,
      last_event_ts: watch.last_event_ts,
      last_narrated_milestone: watch.last_narrated_milestone,
    },
    signals: { jobStatus, latestEventTs, now: new Date().toISOString() },
  });

  if (plan.narrationRow) {
    await insertNarration(cfg, { ...plan.narrationRow, spoken_at: new Date().toISOString() });
  }
  // Libera o lock do claim e grava a nova fase/cursores.
  await patchWatch(cfg, watch.id, { ...plan.watchPatch, locked_by: null });
  console.log(`poll-watch-once: watch ${watch.id} → ${String(plan.watchPatch.phase)}`);
}

main().catch((err: unknown) => {
  console.error('poll-watch-once error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
