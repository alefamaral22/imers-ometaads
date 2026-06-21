---
name: daily-summary-cliente-exemplo
description: Resumo diário do cliente-exemplo — agrega as analyses do dia (gasto, resultados, ROAS, vereditos) num upsert idempotente de daily_summaries via REST. Notifica por Telegram se configurado, com fallback log-only. Somente leitura na Meta (na prática, nem toca a Meta). Headless e idempotente.
allowed-tools: Read, Write, Bash(npx tsx:*), Bash(curl:*)
---

# daily-summary-cliente-exemplo

Skill **headless**. Lê as `analyses` do dia (já gravadas por `funnel-analytics-*`) e produz um
**resumo diário** em `daily_summaries`, idempotente por `(client_id, summary_date)`. Persistência via
**REST + `SUPABASE_SECRET_KEY`** (nunca o MCP do Supabase). Ver ADR `0024-analise-diaria-de-todas-as-campanhas`.

## Regras invioláveis

- **Idempotente:** upsert por `(client_id, summary_date)` → re-rodar no mesmo dia atualiza, não duplica.
- Sem PII no `summary`/`structured` (só agregados e contagens).
- Telegram é **opcional**: sem `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, **degrada para log-only**
  (nunca falha a skill por causa da notificação).
- Dinheiro em centavos; ROAS adimensional; "sem gasto" → ROAS null.

## Pré-condições

- Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Opcional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## Fluxo

1. **Cliente** — `lista-de-clientes` (`SLUG=cliente-exemplo`); extraia `id`.
2. **Data** — `summary_date` = dia alvo (`YYYY-MM-DD`, ex.: ontem em UTC).
3. **Ler análises do dia** — via `selectRows` (`scripts/onda2/infrastructure/supabase-rest.ts`):
   `analyses?client_id=eq.<id>&created_at=gte.<date>T00:00:00Z&created_at=lt.<date+1>T00:00:00Z&select=*`.
   Para cada análise, agregue os `metric_snapshots` (impressões, gasto, resultados) e os `funnel_events`
   `purchase` (value_cents) num `AnalysisDigest`.
4. **Resumo puro**:

   ```bash
   npx tsx -e "
   import { buildDailySummary } from './scripts/onda4/application/daily-summary.ts';
   import { dailySummaryRow } from './scripts/onda4/application/persistence-rows.ts';
   import { buildDailySummaryManifest, manifestPath } from './scripts/onda4/application/manifest.ts';
   // carregue { summaryDate, analyses: AnalysisDigest[] } de um JSON temporário e imprima o resultado
   "
   ```

5. **Upsert** — `upsertRow(cfg, 'daily_summaries', dailySummaryRow(clientId, ds), 'client_id,summary_date')`
   (merge-duplicates → idempotente).
6. **Notificar (opcional)** — se houver token/chat, `curl` para a API do Telegram com o `summary`.
   Em erro ou sem credenciais, apenas logue (nunca derrube a skill).
7. **Manifest** — `tentativas-geracao-de-campanhas/<stamp>-daily-summary.json`.

## Critérios de aceite

Uma execução faz **upsert de 1 linha** em `daily_summaries` para a data; re-rodar não duplica; sem
PII; Telegram degrada para log-only quando não configurado.
