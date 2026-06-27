#!/usr/bin/env bash
# Publica uma LP JÁ serializada em landing-pages/_template: build estático + wrangler deploy, tudo
# numa execução BLOQUEANTE única. Existe para tirar o passo lento do loop agêntico da skill: o
# modelo headless, ao fazer polling de um build longo, às vezes emite um texto sem chamar ferramenta
# e o loop encerra ANTES do deploy (falso-verde, url nula). Aqui é determinístico: builda, deploya,
# extrai a URL e a imprime como `PUBLISH_LP_URL=<url>` (a skill só precisa capturar essa linha).
#
# Pré-condições (validadas pelo run-skill.sh antes do claude): CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.
# Uso: bash scripts/publish-lp.sh <subdomain>
set -euo pipefail

SUBDOMAIN="${1:?uso: publish-lp.sh <subdomain>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/landing-pages/_template"

echo "publish-lp: build estático de '${SUBDOMAIN}' (build:ci limpa .next/out e capa o heap)…"
# build:ci = `rm -rf .next out && NODE_OPTIONS=--max-old-space-size=896 next build` (uma fonte de
# verdade no package.json). O swap (fly.toml) cobre os picos de memória do export no VM pequeno.
npm run build:ci

if [[ ! -d out ]]; then
  echo "publish-lp: ERRO build não gerou 'out/' (export estático falhou)" >&2
  exit 1
fi

echo "publish-lp: deploy no Cloudflare Pages (projeto cliente-exemplo-${SUBDOMAIN})…"
deploy_log="$(npx wrangler pages deploy out --project-name "cliente-exemplo-${SUBDOMAIN}" 2>&1)"
echo "$deploy_log"

# A URL de preview do Pages sai no stdout do wrangler (https://<hash|branch>.<project>.pages.dev).
url="$(printf '%s\n' "$deploy_log" | grep -oE 'https://[a-z0-9.-]+\.pages\.dev' | head -1)"
if [[ -z "$url" ]]; then
  echo "publish-lp: ERRO não consegui extrair a URL do deploy" >&2
  exit 1
fi

echo "PUBLISH_LP_URL=${url}"
