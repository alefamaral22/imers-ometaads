#!/usr/bin/env bash
# Onda 3 — Executor de skill headless (SPEC §8 Onda 3 / §10). Valida a skill on-disk, roda
# `claude -p` em modo stream-json, faz tee de log e emite agent_events pelo stream. Pode ser chamado
# pelo poller (com um job) ou diretamente pelo cron (skill agendada). Sai com o exit code do claude.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKILL="${1:-}"
if [[ -z "$SKILL" ]]; then
  echo "run-skill: usage: run-skill.sh <skill-name>" >&2
  exit 2
fi

# Allowlist on-disk (defesa em profundidade; o poll-once.ts já validou via TS). Nunca texto livre.
if [[ ! "$SKILL" =~ ^[a-z0-9][a-z0-9-]{0,80}$ ]] || [[ ! -d ".claude/skills/$SKILL" ]]; then
  echo "run-skill: unknown skill '$SKILL'" >&2
  exit 2
fi

mkdir -p logs
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="logs/${STAMP}-${SKILL}.log"

echo "run-skill: $SKILL (run_id=${AGENT_RUN_ID:-none}) -> $LOG"

# Hook de telemetria fina por tool-use é OPT-IN (RUNNER_HOOKS=1) para não poluir sessões interativas.
# Default off: os marcos start/end já são garantidos pelo parser de stream-json.
SETTINGS_ARGS=()
if [[ "${RUNNER_HOOKS:-0}" == "1" && -f ".claude/runner-settings.json" ]]; then
  SETTINGS_ARGS=(--settings .claude/runner-settings.json)
fi

# claude -p com stream-json: a saída é tee-ada para o log e canalizada para a telemetria.
# pipefail + PIPESTATUS garantem que o exit code reflita o `claude`, não o `tee`/emitter.
set +e
claude -p ".claude/skills/${SKILL}" \
  --dangerously-skip-permissions \
  --output-format stream-json \
  --verbose \
  "${SETTINGS_ARGS[@]}" \
  2> >(tee -a "$LOG" >&2) \
  | tee -a "$LOG" \
  | npx tsx scripts/runner/emit-from-stream.ts
code="${PIPESTATUS[0]}"
set -e

echo "run-skill: $SKILL exit=$code"
exit "$code"
