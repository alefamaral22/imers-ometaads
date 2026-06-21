// Onda 3 — Processa NO MÁXIMO um job por execução (chamado a cada minuto por poll-agent-jobs.sh,
// já sob lock). Fluxo: claim atômico → validar skill/args → running → run-skill.sh → completed/failed,
// com eventos start/end garantidos em agent_events. Idempotência/dedup vêm do índice único parcial +
// claim_agent_job (FOR UPDATE SKIP LOCKED) no banco.

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { assertSafeArgs, validateSkillName } from './domain/skill.ts';
import { finishedPatch, runningPatch } from './domain/job.ts';
import { endEvent, startEvent } from './domain/agent-event.ts';
import {
  claimAgentJob,
  insertAgentEvent,
  patchAgentJob,
  readRunnerConfig,
  type RunnerConfig,
} from './infrastructure/supabase.ts';
import { listAvailableSkills } from './infrastructure/skills-fs.ts';

function emit(cfg: RunnerConfig, row: Parameters<typeof insertAgentEvent>[1]): Promise<void> {
  return insertAgentEvent(cfg, row).catch((err: unknown) => {
    process.stderr.write(`telemetry: ${err instanceof Error ? err.message : String(err)}\n`);
  });
}

async function main(): Promise<void> {
  const cfg = readRunnerConfig();

  const job = await claimAgentJob(cfg);
  if (!job) {
    process.stdout.write('no-job\n');
    return;
  }
  process.stdout.write(`claimed job ${job.id} (${job.skill})\n`);

  // Validação de fronteira ANTES de qualquer execução: skill por allowlist on-disk + args seguros.
  let safeArgs: Record<string, string>;
  try {
    validateSkillName(job.skill, listAvailableSkills());
    safeArgs = assertSafeArgs(job.args);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await patchAgentJob(cfg, job.id, finishedPatch(1, new Date().toISOString(), reason));
    await emit(cfg, endEvent(job.id, job.skill, 1));
    throw new Error(`rejected job ${job.id}: ${reason}`);
  }

  await patchAgentJob(cfg, job.id, runningPatch(new Date().toISOString()));
  await emit(cfg, startEvent(job.id, job.skill));

  // Executa a skill via run-skill.sh (que faz claude -p stream-json | emit-from-stream).
  // AGENT_RUN_ID liga a telemetria do stream ao job; AGENT_ARGS passa os args já validados.
  const result = spawnSync('bash', ['scripts/run-skill.sh', job.skill], {
    stdio: 'inherit',
    env: {
      ...process.env,
      AGENT_RUN_ID: job.id,
      AGENT_ARGS: JSON.stringify(safeArgs),
    },
  });
  const exitCode = result.status ?? 1;

  await emit(cfg, endEvent(job.id, job.skill, exitCode));
  await patchAgentJob(
    cfg,
    job.id,
    finishedPatch(exitCode, new Date().toISOString(), result.error?.message),
  );
  process.stdout.write(`job ${job.id} -> ${exitCode === 0 ? 'completed' : 'failed'}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`poll-once: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
