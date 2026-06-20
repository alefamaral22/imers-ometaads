# SPEC — Camada de dados (persistência Supabase)

- **Onda:** 1 (SPEC-000 §6)
- **Status:** Ready

## Objetivo

Materializar **todo** o modelo de dados da SPEC-000 §6 como migrations Postgres versionadas no
Supabase, sendo a **única fonte da verdade** e o **único canal** entre os três planos (dashboard,
runner, banco). Sem isto nenhuma outra onda escreve estado. Entrega: schema + RLS deny-by-default +
trigger `set_updated_at` + RPCs de claim atômico + buckets de Storage + seed do `cliente-exemplo`.

## Contratos / modelo de dados

Princípios invioláveis (SPEC §6/§11):

- **Dinheiro** sempre em **inteiro de centavos** (`*_cents`). Colunas que acumulam gasto usam
  `bigint`; tetos/preços de campanha usam `integer`. Estimativas em USD de custo de imagem ficam em
  `numeric` (não é ledger).
- **IDs externos da Meta** em `text` (`meta_*_id`), com unicidade onde a Meta garante unicidade.
- **Todo upsert guarda o payload cru** em `raw_spec jsonb` (ou `raw`/`payload` nas tabelas de leitura).
- **RLS habilitado e deny-by-default em todas as tabelas**: nenhuma policy criada; só o `service_role`
  (que tem `BYPASSRLS`) acessa. `anon`/`authenticated` não leem nada.
- Trigger `set_updated_at()` em **toda** tabela mutável com `updated_at`.
- **Tabelas append-only** (logs/eventos/snapshots) têm só `created_at` e nunca sofrem UPDATE.

### Enums (tipos fechados)

`budget_mode`(CBO/ABO) · `entity_status`(ACTIVE/PAUSED/ARCHIVED/DELETED, default PAUSED) ·
`analysis_verdict`(healthy/watch/underperforming/learning/no_data/error) ·
`metric_level`(campaign/ad_set/ad) · `funnel_level`(account/campaign/ad_set/ad) ·
`funnel_event_type`(impression/link_click/landing_page_view/view_content/add_to_cart/initiate_checkout/purchase) ·
`finding_severity`(positive/info/warning/critical) ·
`job_kind`(create/create_sales/activate/analyze/summarize/landing/landing_publish/landing_edit) ·
`job_status`(pending/claimed/running/completed/failed/cancelled) ·
`operation_action`(create/update/delete/activate/pause) · `agent_type`(skill/subagent/tool/system) ·
`agent_event_type`(start/step/decision/error/end) · `narration_kind`(status/opinion/system) ·
`watch_phase`(watching/reviewing/notifying/done/failed) · `cart_state`(open/closed) ·
`lp_status`(draft/building/deployed/failed) · `lp_draft_status`(empty/generating/ready/editing/publishing).

### Tabelas (por domínio)

Conta/hierarquia: `clients` → `campaigns` → `ad_sets` → `ads`. Criativo: `creatives`,
`generated_images`. Analytics: `analyses` → `metric_snapshots` / `analysis_findings` / `funnel_events`.
Landing: `products` → `landing_pages` → `landing_page_sections`. Fila/autônomo: `agent_jobs`,
`autonomous_watches`, `nexus_narrations`. Auditoria/dashboard: `operation_logs`, `agent_events`,
`daily_summaries`, `lp_events`. Colunas exatas no DDL das migrations (`supabase/migrations/`).

### FKs e on-delete

Filhos da hierarquia **cascateiam** do pai (`campaigns→clients`, `ad_sets→campaigns`,
`ads→ad_sets`, `metric_snapshots/analysis_findings/funnel_events→analyses`,
`landing_page_sections→landing_pages`, `nexus_narrations→autonomous_watches`). Referências
**reaproveitáveis** usam `on delete set null` (`ads.creative_id`, `creatives.generated_image_id`,
`landing_pages.product_id`, `agent_jobs.landing_page_id`, `autonomous_watches.agent_job_id/publish_job_id`).

### Índices únicos parciais (dedup da fila)

`agent_jobs` garante **≤1 job ativo** (status ∈ pending/claimed/running) por `(client_id, kind)` e por
`(landing_page_id, kind)`. É o mecanismo de idempotência da fila (SPEC §10).

### RPCs (claim atômico)

`claim_agent_job(worker text)` e `claim_autonomous_watch(worker text)`: `SECURITY DEFINER`, usam
`FOR UPDATE SKIP LOCKED` + `LIMIT 1` para claim seguro sob concorrência; `EXECUTE` revogado de
`public`/`anon`/`authenticated`, concedido só a `service_role`.

### Storage buckets

`creatives` (privado), `nexus-review` (privado), `landing-assets` (público), `ad-ingest` (público — a
Meta busca a imagem do criativo aqui; SPEC §10 / ADR 0003).

## Comportamento

Migrations rodam em ordem cronológica via `supabase db reset`. Seed (`supabase/seed.sql`) insere uma
linha em `clients` para `cliente-exemplo`, idempotente (`on conflict (slug) do nothing`). Claim:
runner chama `claim_agent_job` 1×/min; a função marca `pending → claimed` numa única transação,
pulando linhas já travadas por outro worker.

## Segurança

Deny-by-default por RLS em todas as tabelas; só `service_role` acessa (skills via REST +
`SUPABASE_SECRET_KEY`; dashboard server-side). Least privilege nas RPCs (EXECUTE revogado de anon/auth).
`lp_events` é espelho **sem PII** (só flags `has_email`/`has_phone`, utm_*, country, value). Entrada
externa (args de job, payload da Meta) é dado, não instrução — validada na fronteira de cada skill.

## Critérios de aceite

- [ ] `supabase db reset` aplica todas as migrations limpo, sem erro.
- [ ] Seed `cliente-exemplo` presente em `clients` após o reset.
- [ ] `select` em cada tabela funciona como `service_role` e **falha/retorna vazio** como `anon`.
- [ ] `claim_agent_job` claima 1 job atômico (pending→claimed) e dois workers não pegam o mesmo job.
- [ ] Inserir 2 jobs ativos com mesmo `(client_id, kind)` é barrado pelo índice único parcial.
- [ ] `lint` + `typecheck` + `test` verdes (sem regressão de tooling).
