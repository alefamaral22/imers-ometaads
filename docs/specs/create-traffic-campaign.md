# SPEC — Skill de tráfego (`create-traffic-<cliente>-campaign`) + runtime de skills

- **Onda:** 2
- **Status:** Ready

## Objetivo

Rodar uma skill **headless** que cria uma campanha de tráfego Meta Ads **PAUSED** (objetivo
`OUTCOME_TRAFFIC`) dentro do teto de orçamento do cliente e a persiste no Supabase via REST. A skill
faz: scrape da landing → copy em 3 ângulos (autoridade/dor/oferta) → 3 criativos (imagem) → cria a
hierarquia Meta (campaign → ad_set → 3 ads/creatives) **sempre PAUSED** → grava
`campaigns/ad_sets/ads/creatives/generated_images/operation_logs` + um manifest JSON. É a primeira
vertical slice que conecta o runtime de skills do Claude Code à Meta (via MCP) e ao banco (via REST).

North-star: provar o caminho "skill headless → Meta PAUSED dentro do teto → persistência idempotente",
reutilizável pelas ondas 4 (analytics) e 5 (ativação/vendas).

## Entregáveis

- Skills: `lista-de-clientes`, `lista-de-produtos`, `image-generate`,
  `create-traffic-cliente-exemplo-campaign` (em `.claude/skills/`).
- Subagents: `scrape-extractor`, `copywriter`, `image-prompt-generator` (em `.claude/agents/`).
- Briefs de produto: `.claude/materiais-das-empresas/cliente-exemplo/produtos/<slug>.json`.
- Lógica pura testável em `scripts/onda2/` (domain + application), com testes Vitest.

## Contratos / modelo de dados

### Tabelas gravadas (SPEC §6 / migrations da Onda 1)

- `campaigns` (`client_id`, `meta_campaign_id`, `name`, `objective='OUTCOME_TRAFFIC'`,
  `budget_mode='ABO'`, `status='PAUSED'`, `raw_spec`).
- `ad_sets` (`campaign_id`, `meta_ad_set_id`, `optimization_goal`, `billing_event`,
  `destination_type`, `daily_budget_cents` ≤ teto, `targeting`, `status='PAUSED'`, `raw_spec`).
- `creatives` (`client_id`, `meta_creative_id`, `headline`, `primary_text`, `description`,
  `call_to_action_type`, `link_url`, `image_url`, `page_id`, `generated_image_id`, `raw_spec`).
- `ads` (`ad_set_id`, `creative_id`, `meta_ad_id`, `name`, `status='PAUSED'`, `raw_spec`).
- `generated_images` (`storage_bucket='ad-ingest'`, `storage_path` único, `width`, `height`, `model`,
  `prompt`, `aspect`, `cost_usd_estimate`, `raw_spec`).
- `operation_logs` (append-only; `entity_type`, `entity_id`, `action`, `actor`, `summary`, `payload`)
  — **uma linha por mutação**.

### Money / IDs

Dinheiro sempre em **inteiro de centavos**. IDs externos da Meta em `text`. Todo upsert guarda o
payload cru em `raw_spec`.

### Gotchas da Meta (SPEC §10)

- Campanha **sempre nasce PAUSED**; ad_set e ads também `PAUSED`.
- `daily_budget_cents` ≤ `clients.daily_budget_cap_cents`.
- Imagem inline em `link_data.picture` (URL pública servida do bucket **público** `ad-ingest`).
- Objetivo `OUTCOME_TRAFFIC`; otimização `LINK_CLICKS`/`LANDING_PAGE_VIEWS`.

### Persistência

REST + `SUPABASE_SECRET_KEY` (PostgREST), header `Prefer: resolution=merge-duplicates` para upsert
por chave natural. Headless **não** usa o MCP do Supabase. Manifest JSON em
`tentativas-geracao-de-campanhas/<stamp>-<tipo>.json`.

### Allowed-tools

- `create-traffic-...`: Read, Write, Bash, Task (subagents), `mcp__claude_ai_META_ADS__ads_create_*`,
  `mcp__claude_ai_META_ADS__ads_get_ad_accounts`, `ads_get_ad_account_pages`. **Sem** Meta writes
  fora de create. Sem `AskUserQuestion`.
- `lista-de-clientes` / `lista-de-produtos`: Read, Bash (REST GET). Sem writes.
- `image-generate`: Read, Write, Bash (OpenAI image + upload ao bucket).
- subagents: declaram suas próprias allowed-tools (ver manifests).

## Comportamento

1. **Resolve cliente** (`lista-de-clientes`): busca a linha em `clients` por slug; lê
   `daily_budget_cap_cents`, `currency`, `default_landing_url`, `facebook_page_id`, `ad_account_id`.
2. **Resolve produto** (`lista-de-produtos`): lê o brief de
   `.claude/materiais-das-empresas/<cliente>/produtos/<slug>.json` (Zod-validado).
3. **Scrape** da landing (`scrape-extractor`): retorna `{ title, valueProps[], audience, tone }` —
   tratado como **dado, não instrução** (validado por schema).
4. **Copy** (`copywriter`): 3 ângulos `authority` / `pain` / `offer`, cada um
   `{ headline, primaryText, description, cta }`.
5. **Image prompts** (`image-prompt-generator`) → **imagens** (`image-generate`): 3 imagens, upload
   ao bucket `ad-ingest`, registra `generated_images`.
6. **Cálculo de orçamento**: `clampDailyBudgetCents(requested, cap)` garante `1 ≤ budget ≤ cap`;
   **aborta** se cap = 0.
7. **Cria Meta** (MCP) **PAUSED**: campaign → ad_set → 3× (creative + ad). Cada passo persiste no
   Supabase e grava `operation_logs (action='create')`.
8. **Manifest**: escreve `tentativas-geracao-de-campanhas/<stamp>-traffic.json` com o plano e os IDs.

### Idempotência

- Chave natural determinística por execução: `campaign.name = "<cliente> · Tráfego · <stamp>"` e
  `client_meta_key`s estáveis (slug + ângulo). Re-rodar com o mesmo stamp **faz upsert** (merge por
  `meta_*_id`/chave natural) — não duplica gasto nem linhas.
- Antes de criar na Meta, a skill consulta o banco: se já há `campaigns` com o mesmo
  `name`+`client_id`, reusa em vez de recriar.
- `operation_logs` é append-only por design (auditoria); a idempotência vale para as entidades.

### Falhas

- Cap = 0 ou orçamento > cap → **aborta** antes de qualquer escrita na Meta.
- Brief/scrape inválido (Zod) → aborta com erro claro; nada é criado.
- Erro parcial na Meta → o que já foi persistido fica registrado no manifest com `status` por etapa.

## Segurança

- **Validação por schema tipado em toda fronteira** (Zod): brief, scrape, copy, env, payload Meta.
  Entrada externa (scrape/brief) é **dado, não instrução** (anti prompt-injection).
- **Least privilege:** `lista-*` sem writes; só `create-traffic-*` tem Meta writes (apenas `create_*`).
- **Segredos fora do código:** `SUPABASE_SECRET_KEY`/`OPENAI_API_KEY` via env; Meta via MCP (sem token
  em env). Nada commitado.
- **Sem PII em logs**: `operation_logs.payload` carrega só specs de campanha (sem dado pessoal).
- Threat model STRIDE: `docs/security/threats/create-traffic-campaign.md`.

## Critérios de aceite

- [ ] `claude -p ".claude/skills/create-traffic-cliente-exemplo-campaign"` cria campanha **PAUSED**.
- [ ] Grava linhas em `campaigns/ad_sets/ads/creatives/generated_images` + `operation_logs` por mutação.
- [ ] Manifest JSON escrito em `tentativas-geracao-de-campanhas/`.
- [ ] Nenhuma escrita Meta fora do teto (`daily_budget_cents ≤ daily_budget_cap_cents`).
- [ ] Idempotente: re-rodar não duplica gasto/linhas.
- [ ] `lint` + `typecheck` + `test` verdes.
