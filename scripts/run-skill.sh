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

# Pré-condições determinísticas por skill: variáveis de ambiente obrigatórias. Sem elas a skill não
# tem como executar de verdade (ex.: publish sem credencial Cloudflare). Falhamos AQUI (exit 1) em vez
# de deixar o claude "abortar narrando" e sair 0 — isso viraria job `completed` sem trabalho (falso
# verde). Defesa determinística, independente do modelo.
REQUIRED_ENV=()
case "$SKILL" in
  publish-landing-page-*)
    REQUIRED_ENV=(SUPABASE_URL SUPABASE_SECRET_KEY CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID)
    ;;
esac
for var in "${REQUIRED_ENV[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "run-skill: $SKILL precondition failed: \$$var is empty (aborting before claude)" >&2
    exit 1
  fi
done

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

# Prompt IMPERATIVO (não apenas o caminho da skill). Passar só ".claude/skills/<skill>" é ambíguo: o
# modelo ora executa, ora apenas RESUME a SKILL.md — e como o exit fica 0 mesmo sem trabalho, o job
# vira "completed" sem ter feito nada (falso verde). Aqui exigimos execução real, ponta a ponta, e
# injetamos os AGENT_ARGS (ex.: o stamp) — que antes não chegavam ao prompt.
ARGS_JSON="${AGENT_ARGS:-{}}"
PROMPT="Execute headless (sem humano) a skill definida em .claude/skills/${SKILL}/SKILL.md AGORA, por completo: rode TODOS os passos você mesmo e faça as chamadas reais (MCP da Meta, persistência REST, geração de imagem). Isto é um pedido de EXECUÇÃO — NÃO resuma, NÃO explique, NÃO descreva a skill. Args de entrada (JSON): ${ARGS_JSON}. Ao terminar, relate exatamente o que foi criado (IDs Meta + linhas gravadas) ou, se algo falhar, FALHE em voz alta com o erro."

# claude -p com stream-json: a saída é tee-ada para o log e canalizada para a telemetria.
# pipefail + PIPESTATUS garantem que o exit code reflita o `claude`, não o `tee`/emitter.
set +e
claude -p "$PROMPT" \
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
