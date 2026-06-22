# How-to: colocar a plataforma no ar (go-live)

> Plano operacional, passo a passo, para sair de "código completo (Ondas 0→11)" para
> "plataforma 100% no ar". Cada fase tem comandos reais (batem com `fly.toml`, `wrangler.toml`,
> `vercel.json`, `deploy.yml`) e o que precisa ser feito em plataformas externas.
>
> **Estado de partida:** código completo e testado; banco Supabase `yjmngxsdfsxtzjastvwi`
> provisionado e validado; dashboard roda em localhost. Falta: deploy real + credenciais.

## Ordem das fases

0. Pré-requisitos (remote GitHub + CLIs)
1. Supabase ✅ (feito — falta distribuir o `SUPABASE_SECRET_KEY`)
2. Runner no Fly.io (núcleo 24/7)
3. Primeiro job real (teste de fumaça `job → runner → completed`)
4. Cloudflare Worker (tracking) — só depois de ter landing publicada
5. Dashboard no Vercel
6. CI/CD (automatiza 2 e 5)

---

## Fase 0 — Pré-requisitos

- [ ] **Domínio:** hoje o código usa o placeholder `example.com`. Para validar o runner não é
  necessário; para landing/tracking em produção, trocar pelo domínio real.
- [ ] **Remote GitHub** (sem ele o CI/CD não roda):
  ```bash
  gh repo create <seu-repo> --private --source . --remote origin --push
  ```
- [ ] **CLIs:** `flyctl`, `wrangler`, `vercel`. (`npm i -g wrangler vercel`; flyctl pelo instalador.)

## Fase 1 — Supabase ✅

Banco provisionado e validado. Falta apenas colar o `SUPABASE_SECRET_KEY` (service_role) onde
for consumido: Fly (secrets), Vercel (env), Worker (wrangler secret).

## Fase 2 — Runner no Fly.io

```bash
flyctl launch --no-deploy --copy-config --name meta-ads-agents
flyctl volumes create claude_oauth --region gru --size 1
flyctl secrets set \
  SUPABASE_URL="https://yjmngxsdfsxtzjastvwi.supabase.co" \
  SUPABASE_SECRET_KEY="<service_role>" \
  CLAUDE_API_KEY="<...>" \
  OPENAI_API_KEY="<...>"
flyctl deploy --remote-only
flyctl ssh console -C "claude login"
```
`crontab` já configurado: poll da fila 1/min, poll de watches 1/min, tráfego 09:00 UTC,
analytics 10:00, resumo 10:30. ⚠️ MCP da Meta no `claude -p` headless nunca foi exercitado.

## Fase 3 — Primeiro job real (aceite #3 da SPEC)

Inserir um job leve em `agent_jobs` via SQL e observar `flyctl logs`: status deve ir
`pending → running → completed` e `agent_events` receber start/end com `run_id`.

## Fase 4 — Cloudflare Worker (tracking)

```bash
cd worker/track
wrangler kv namespace create RATE_LIMIT      # id -> wrangler.toml
wrangler d1 create track                     # id -> wrangler.toml
wrangler d1 execute track --remote --file=./schema.sql
wrangler secret put SUPABASE_SECRET_KEY
wrangler secret put META_CAPI_TOKEN
wrangler secret put GA4_API_SECRET
wrangler deploy
```
Trocar `example.com`/`SUPABASE_URL` reais no `wrangler.toml`. Aceite: `POST /e` grava
`lp_events` sem PII.

## Fase 5 — Dashboard no Vercel

```bash
vercel link
# Vercel -> Settings -> Environment Variables:
#   SUPABASE_URL, SUPABASE_SECRET_KEY, AUTH_SECRET, DASHBOARD_PASSWORD (hash),
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
#   TTS_PROVIDER + chaves do Nexus
vercel deploy --prod
```
`vercel.json` já define framework/região/build do monorepo e o cron de `/api/health`.

## Fase 6 — CI/CD

GitHub -> Settings -> Secrets -> Actions: `FLY_API_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`. Push na `main` passa a fazer deploy automático (pula o que não tiver token).

---

## Riscos a vigiar

1. **Meta via MCP no headless** — nunca testado em runtime real (maior incerteza).
2. **`example.com`** espalhado no código — trocar pelo domínio real antes de landing/tracking prod.
3. **`.env.example`** ainda não espelha `TTS_PROVIDER`/`MINIMAX_*`.
4. **Custo real:** cron de tráfego cria campanha PAUSED (não gasta); `activate` é gasto real,
   só por confirmação no Nexus.
