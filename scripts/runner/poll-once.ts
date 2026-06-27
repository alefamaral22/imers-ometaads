// Onda 3 — Processa NO MÁXIMO um job por execução (chamado a cada minuto por poll-agent-jobs.sh,
// já sob lock). Fluxo: claim atômico → validar skill/args → running → run-skill.sh → completed/failed,
// com eventos start/end garantidos em agent_events. Idempotência/dedup vêm do índice único parcial +
// claim_agent_job (FOR UPDATE SKIP LOCKED) no banco.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import type { ClaimedJob } from './domain/job.ts';
import { planTenantKeyEnv } from '../onda12/application/tenant-key-env.ts';
import {
  selectAccountRole,
  selectAccountKeys,
  decryptAccountKey,
  readEncKeys,
} from '../onda12/infrastructure/secrets-rest.ts';

// Onda 12 — provedor → variável de ambiente que o subprocesso da skill lê.
const PROVIDER_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY', // o claude -p lê ANTHROPIC_API_KEY
  openai: 'OPENAI_API_KEY',
};
const TENANT_PROVIDERS = ['anthropic', 'openai'];

/**
 * Resolve as chaves de API do tenant dono do job (ADR 0027). super_admin (conta-âncora da agência)
 * preserva o caminho atual (OAuth/global) — NÃO injeta nada. Tenant pagante roda o subprocesso com as
 * próprias chaves; sem chave própria utilizável, o job aborta cedo (ok:false). Erro ao ler a account
 * degrada para "sem injeção" (nunca quebra a fila atual do super_admin).
 */
async function resolveTenantKeyEnv(
  cfg: RunnerConfig,
  job: ClaimedJob,
): Promise<{ ok: true; overrides: Record<string, string> } | { ok: false; reason: string }> {
  if (!job.accountId) return { ok: true, overrides: {} };

  let role: string | null;
  try {
    role = await selectAccountRole(cfg, job.accountId);
  } catch (err) {
    process.stderr.write(
      `tenant-keys: role lookup failed (${err instanceof Error ? err.message : String(err)})\n`,
    );
    return { ok: true, overrides: {} };
  }
  if (role === null || role === 'super_admin') return { ok: true, overrides: {} };

  const keys = await selectAccountKeys(cfg, job.accountId);
  const plan = planTenantKeyEnv({
    role: role as 'socio' | 'cliente_usuario',
    tenantKeys: keys.map((k) => ({ provider: k.provider, status: k.status })),
    globalProviders: {}, // tenant pagante nunca usa a global → irrelevante para o abort
    providers: TENANT_PROVIDERS,
  });
  if (!plan.ok) return { ok: false, reason: plan.reason };

  const encKeys = readEncKeys();
  const overrides: Record<string, string> = {};
  for (const provider of plan.useTenant) {
    const row = keys.find((k) => k.provider === provider);
    const envName = PROVIDER_ENV[provider];
    if (row && envName) overrides[envName] = decryptAccountKey(row, encKeys);
  }
  return { ok: true, overrides };
}

function rmIfExists(p: string): void {
  try {
    if (existsSync(p)) unlinkSync(p);
  } catch {
    // best-effort: limpeza do arquivo de diagnóstico nunca derruba o poller
  }
}

/**
 * Monta a mensagem de erro do job (ETAPA 1 "nunca silêncio"): prioriza o erro ESTRUTURADO do claude
 * (linha `result` capturada pelo emit-from-stream no sidecar), cai para o tail do stderr (refusas de
 * startup como sandbox, que não saem no stream) e, por fim, o erro de spawn. Nunca lança.
 */
function resolveJobError(
  errorFile: string,
  stderr: string | null | undefined,
  spawnError: string | undefined,
): string | undefined {
  try {
    if (existsSync(errorFile)) {
      const txt = readFileSync(errorFile, 'utf8').trim();
      if (txt.length > 0) return txt.slice(0, 2000);
    }
  } catch {
    // best-effort
  }
  const tail = (stderr ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(-12)
    .join('\n')
    .trim();
  if (tail.length > 0) return tail.slice(0, 2000);
  return spawnError;
}

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

  // Onda 12 — chaves por tenant: resolve ANTES de rodar. Tenant pagante sem chave própria utilizável
  // aborta o job aqui (não vaza gasto para a global). super_admin é no-op (caminho atual preservado).
  const keyEnv = await resolveTenantKeyEnv(cfg, job);
  if (!keyEnv.ok) {
    await patchAgentJob(cfg, job.id, finishedPatch(1, new Date().toISOString(), keyEnv.reason));
    await emit(cfg, endEvent(job.id, job.skill, 1));
    process.stdout.write(`job ${job.id} -> failed (tenant key: ${keyEnv.reason})\n`);
    return;
  }

  await patchAgentJob(cfg, job.id, runningPatch(new Date().toISOString()));
  await emit(cfg, startEvent(job.id, job.skill));

  // Executa a skill via run-skill.sh (que faz claude -p stream-json | emit-from-stream).
  // AGENT_RUN_ID liga a telemetria do stream ao job; AGENT_ARGS passa os args já validados.
  // keyEnv.overrides injeta as chaves do tenant (ou {} para super_admin) — nunca logadas.
  // Captura o erro real do claude para diagnóstico/feedback (ETAPA 1 "nunca silêncio"):
  // RUNNER_ERROR_FILE recebe a mensagem da linha `result`/`error` do stream (via emit-from-stream);
  // o stderr é capturado para pegar refusas de startup do claude que não saem no stream.
  const errorFile = join(tmpdir(), `runner-err-${job.id}.txt`);
  rmIfExists(errorFile);

  const result = spawnSync('bash', ['scripts/run-skill.sh', job.skill], {
    // stdout segue ao vivo para o log do cron; só o stderr é capturado para virar agent_jobs.error.
    stdio: ['inherit', 'inherit', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      AGENT_RUN_ID: job.id,
      AGENT_ARGS: JSON.stringify(safeArgs),
      RUNNER_ERROR_FILE: errorFile,
      ...keyEnv.overrides,
    },
  });
  if (result.stderr) process.stderr.write(result.stderr);
  const exitCode = result.status ?? 1;
  const errorMessage =
    exitCode === 0 ? undefined : resolveJobError(errorFile, result.stderr, result.error?.message);
  rmIfExists(errorFile);

  await emit(cfg, endEvent(job.id, job.skill, exitCode));
  await patchAgentJob(cfg, job.id, finishedPatch(exitCode, new Date().toISOString(), errorMessage));
  process.stdout.write(`job ${job.id} -> ${exitCode === 0 ? 'completed' : 'failed'}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`poll-once: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
