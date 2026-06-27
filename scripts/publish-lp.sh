#!/usr/bin/env bash
# Worker de publicação de LP — roda DESTACADO (setsid), fora do loop/timeout do agente. O build
# estático do Next leva ~10 min no VM pequeno; tirá-lo do claude evita o estouro do timeout de 10 min
# da ferramenta Bash (que matava o build antes do export). Ele mesmo grava o resultado no banco:
# `deployed` + url em sucesso, `failed` em erro — então a UI reflete o estado real sem o agente.
#
# Pré-condições (env, herdadas da máquina): SUPABASE_URL, SUPABASE_SECRET_KEY, CLOUDFLARE_API_TOKEN,
# CLOUDFLARE_ACCOUNT_ID. A LP já deve estar SERIALIZADA em landing-pages/_template/generated (a skill
# faz isso antes de lançar). Uso: bash scripts/publish-lp.sh <subdomain>
set -uo pipefail

SUBDOMAIN="${1:?uso: publish-lp.sh <subdomain>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/logs"
LOG="$ROOT/logs/publish-${SUBDOMAIN}-$(date +%Y%m%d-%H%M%S).log"

# PATCH em landing_pages via PostgREST (service_role). $1 = corpo JSON.
patch_lp() {
  curl -sS -X PATCH "${SUPABASE_URL}/rest/v1/landing_pages?subdomain=eq.${SUBDOMAIN}" \
    -H "apikey: ${SUPABASE_SECRET_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$1" >>"$LOG" 2>&1
}

fail() {
  echo "publish-lp: FALHOU: $1" >>"$LOG"
  patch_lp '{"status":"failed"}'
  exit 1
}

{
  echo "publish-lp: início ${SUBDOMAIN} $(date -u +%FT%TZ)"
  cd "$ROOT/landing-pages/_template" || fail "cd template"

  echo "publish-lp: build:ci (export estático, ~10 min)…"
  npm run build:ci || fail "build"
  [ -d out ] || fail "export não gerou out/"

  echo "publish-lp: wrangler pages deploy…"
  deploy_log="$(npx wrangler pages deploy out --project-name "cliente-exemplo-${SUBDOMAIN}" 2>&1)"
  echo "$deploy_log"
  url="$(printf '%s\n' "$deploy_log" | grep -oE 'https://[a-z0-9.-]+\.pages\.dev' | head -1)"
  [ -n "$url" ] || fail "não consegui extrair a URL do deploy"

  echo "publish-lp: url=${url} — gravando deployed"
  patch_lp "{\"status\":\"deployed\",\"url\":\"${url}\",\"fqdn\":\"${SUBDOMAIN}.example.com\"}"
  echo "publish-lp: concluído $(date -u +%FT%TZ)"
} >>"$LOG" 2>&1
