#!/usr/bin/env bash
# Onda 3 — Poller da fila agent_jobs (SPEC §8 Onda 3 / §10). Disparado a cada minuto pelo supercronic.
# Garante exclusão mútua por lock de diretório (mkdir é atômico) e delega a lógica ao TS (poll-once.ts),
# que faz o claim atômico, executa 1 job e patcha o status. Trap libera o lock mesmo em crash.
set -euo pipefail

# Raiz do repo (este script vive em scripts/). Permite rodar de qualquer cwd (cron).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOCK_DIR="${RUNNER_LOCK_DIR:-/tmp/agent-jobs.lock}"

# mkdir falha (atomicamente) se o lock já existe → outra execução está em andamento. Saímos limpos.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "poll-agent-jobs: lock held ($LOCK_DIR); skipping tick"
  exit 0
fi
# Libera o lock em qualquer saída (sucesso, erro ou sinal).
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# Processa no máximo um job. Erros do job NÃO derrubam o poller (o próximo tick continua a fila).
if ! npx tsx scripts/runner/poll-once.ts; then
  echo "poll-agent-jobs: poll-once returned non-zero (job failed or rejected)"
fi
