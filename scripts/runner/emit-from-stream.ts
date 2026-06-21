// Onda 3 — Lê o stream-json do `claude -p` na stdin e emite agent_events (telemetria) via REST.
// Pipe: `claude -p ... --output-format stream-json | tsx scripts/runner/emit-from-stream.ts`.
// run_id vem de AGENT_RUN_ID (o id do job). Falhas de telemetria NUNCA derrubam a skill (best-effort).

import { createInterface } from 'node:readline';
import process from 'node:process';
import { mapStreamLine } from './domain/agent-event.ts';
import { readRunnerConfig, insertAgentEvent } from './infrastructure/supabase.ts';

async function main(): Promise<void> {
  const runId = process.env.AGENT_RUN_ID;
  if (!runId) {
    process.stderr.write('emit-from-stream: AGENT_RUN_ID not set; passing stream through\n');
  }
  // Sem credenciais não há para onde emitir — apenas drena a stdin (não quebra o pipe da skill).
  const canEmit = Boolean(runId && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
  const cfg = canEmit ? readRunnerConfig() : null;

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!cfg || !runId) continue;
    for (const row of mapStreamLine(line, runId)) {
      // Best-effort: um erro de telemetria não pode falhar o job.
      await insertAgentEvent(cfg, row).catch((err: unknown) => {
        process.stderr.write(`emit-from-stream: ${err instanceof Error ? err.message : err}\n`);
      });
    }
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`emit-from-stream fatal: ${err instanceof Error ? err.message : err}\n`);
  // Telemetria é best-effort: saímos 0 para não contaminar o exit code da skill no pipe.
  process.exitCode = 0;
});
