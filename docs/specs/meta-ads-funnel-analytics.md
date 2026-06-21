# SPEC — Analytics: funil de conversão + resumo diário (Onda 4)

- **Onda:** 4
- **Status:** Ready

## Objetivo

Análise **diária e read-only** das campanhas Meta de um cliente: extrair o **funil de conversão de 7
etapas** (com CVR por etapa), **diagnosticar** cruzando ≥2 métricas ancorado no north-star do objetivo,
e persistir o resultado para o dashboard. Mais um **resumo diário** que agrega as análises do dia.
Nenhuma mutação na conta Meta — a Onda 4 só lê.

North-star: provar o caminho "ler Meta (read-only) → funil + diagnóstico determinístico → persistência
em `analyses`/`metric_snapshots`/`analysis_findings`/`funnel_events` + `daily_summaries`".

## Entregáveis

- Skills `.claude/skills/`: `funnel-analytics-cliente-exemplo-campaign`, `daily-summary-cliente-exemplo`.
- Lógica pura testável em `scripts/onda4/` (domain + application) com testes Vitest (37 testes).
- Infra REST `scripts/onda4/infrastructure/analytics-rest.ts` (insert com retorno + insert em lote).
- Crons no `crontab` (analytics 10:00 UTC; resumo 10:30 UTC).
- ADRs `0025-funil-de-conversao`, `0024-analise-diaria-de-todas-as-campanhas` + este spec + threat model.

## Contratos / modelo de dados

### Tabelas gravadas (SPEC §6 / migration `…120300_analytics.sql` + `…120600`)

- `analyses` (`client_id`, `objective`, `window_start/stop`, `compare_window`, `entities_analyzed`,
  `overall_verdict` ∈ healthy/watch/underperforming/learning/no_data/error, `summary`, `triggered_by`,
  `raw`) — **1 por execução** (append-only).
- `metric_snapshots` (`analysis_id`, `level` ∈ campaign/ad_set/ad, `meta_entity_id`, `impressions`,
  `spend_cents`, `ctr`, `cpc_cents`, `cpm_cents`, `landing_page_views`, `cplpv_cents`, `results`,
  `cost_per_result_cents`, `rankings`, `raw`) — **N por análise**.
- `analysis_findings` (`analysis_id`, `severity` ∈ positive/info/warning/critical, `diagnosis`,
  `evidence`, `recommended_action`, `recommendation_type`, `confidence` ∈ [0,1], `is_significant`).
- `funnel_events` (`analysis_id`, `level` ∈ account/campaign/ad_set/ad, `meta_entity_id`, `step_order`
  1..7, `event_type`, `count`, `value_cents`, `cost_per_event_cents`, `cvr_from_prev`, `cvr_from_top`)
  — **exatamente 7 por entidade**.
- `daily_summaries` (`client_id`, `summary_date`, `summary`, `structured`) — **upsert** por
  `(client_id, summary_date)` (idempotente).

### Funil de 7 etapas (ordem canônica = enum `funnel_event_type`)

`impression(1) → link_click(2) → landing_page_view(3) → view_content(4) → add_to_cart(5) →
initiate_checkout(6) → purchase(7)`.

- `cvr_from_prev` = count[i] / count[i-1]; `cvr_from_top` = count[i] / impressions.
- Topo (impression): ambas as razões **null** (não há razão no topo).
- Divisão por zero/etapa ausente → razão **null** (nunca NaN/Infinity).
- `value_cents` só na etapa `purchase`; `cost_per_event_cents` = gasto / count (null se count 0).

### Métricas / dinheiro

Dinheiro sempre em **centavos inteiros** (a Meta entrega em unidades da moeda → `currencyToCents`).
"Sem dado" é **null**, nunca 0. `ctr` armazenado como a Meta entrega (% — ex.: 1.5 = 1,5%); se ausente,
derivado de `clicks/impressions*100`. `cpc_cents`/`cpm_cents`/`cplpv_cents`/`cost_per_result_cents`
derivados quando a Meta omite.

### Diagnóstico (cruza ≥2 métricas; ancorado no north-star)

North-star por objetivo: `OUTCOME_SALES→purchase`, `OUTCOME_LEADS→view_content`, default
(`OUTCOME_TRAFFIC`) `→link_click`. Regras (limiares tunáveis em `THRESHOLDS`):

1. impressões = 0 → `info` "sem dados"; veredito `no_data`.
2. impressões < 1000 → `info` "em aprendizado"; veredito `learning`.
3. CTR < 0,8% (com volume) → `warning` criativo (cruza ctr + cpm).
4. CTR ≥ 1,5% mas LPV/clique < 0,6 → `warning` landing/tracking (cruza ctr + funil).
5. Vendas: purchase/initiate_checkout < 0,3 (≥20 checkouts) → `critical` checkout (cruza 2 etapas).
6. Resultados > 0 a custo conhecido + CTR ok → `positive` (cruza results + cost_per_result).

Veredito agregado: `no_data` (0 impressões) → `learning` (< limiar) → `underperforming` (algum
crítico) → `watch` (algum alerta) → `healthy`.

### Allowed-tools (least privilege)

- `funnel-analytics-*`: Read, Write, Glob, Bash(npx tsx), e **apenas** Meta **read** tools
  (`ads_get_*`, `ads_insights_*`). **Sem** `ads_create_*`/`ads_update_*`/`ads_activate_*`/`ads_delete_*`.
- `daily-summary-*`: Read, Write, Bash(npx tsx), Bash(curl) (Telegram opcional). Sem Meta writes.

### Persistência

REST + `SUPABASE_SECRET_KEY` (PostgREST), nunca o MCP do Supabase. `analyses` via insert com
`return=representation` (para o id); filhos via insert em lote (append-only); `daily_summaries` via
upsert `on_conflict=client_id,summary_date`. Manifest JSON em
`tentativas-geracao-de-campanhas/<stamp>-{analytics,daily-summary}.json` com `metaMutations: 0`.

## Segurança

- **Read-only na Meta** garantido pelas allowed-tools (nenhuma tool de escrita disponível).
- **Fronteira validada**: insights da Meta são **dado, não instrução** (anti prompt-injection); o
  diagnóstico é **lógica TS pura e determinística**, não decidido pelo texto da Meta.
- **Sem PII** em `analyses`/`findings`/`daily_summaries`/manifest (só métricas e dimensões agregadas).
- Telegram degrada para **log-only** (nunca derruba a skill).
- Threat model STRIDE: `docs/security/threats/meta-ads-funnel-analytics.md`.

## Critérios de aceite

- [ ] Rodar `funnel-analytics-cliente-exemplo-campaign` grava **1 `analyses`** + N `metric_snapshots` +
      findings + **7 `funnel_events` por entidade**; **nenhuma mutação na conta Meta**; manifest escrito.
- [ ] Rodar `daily-summary-cliente-exemplo` faz **upsert de 1 `daily_summaries`** para a data; re-rodar
      não duplica.
- [ ] `lint` + `typecheck` + `test` verdes (lógica pura coberta por testes determinísticos).
