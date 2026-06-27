#!/usr/bin/env bash
# Lançador da publicação: marca a LP como `building` (a tela mostra "Em construção" na hora) e dispara
# o worker DESTACADO (publish-lp.sh), retornando IMEDIATAMENTE. A skill chama isto numa única chamada
# rápida — o build longo (~10 min) roda fora do agente, então não há timeout. Uso: este script <subdomain>
set -uo pipefail

SUBDOMAIN="${1:?uso: publish-lp-launch.sh <subdomain>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Marca building (idempotente; falha de rede aqui não impede o build).
curl -sS -X PATCH "${SUPABASE_URL}/rest/v1/landing_pages?subdomain=eq.${SUBDOMAIN}" \
  -H "apikey: ${SUPABASE_SECRET_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"status":"building"}' >/dev/null 2>&1 || true

# setsid = nova sessão: o worker sobrevive ao fim da skill/claude/poll-once (reparenta para o init/tini).
setsid bash "$ROOT/scripts/publish-lp.sh" "$SUBDOMAIN" </dev/null >/dev/null 2>&1 &

echo "publish-lp-launch: ${SUBDOMAIN} marcado 'building'; build+deploy rodando em background (~10 min)."
