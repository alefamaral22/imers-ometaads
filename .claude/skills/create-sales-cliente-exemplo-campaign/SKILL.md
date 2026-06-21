---
name: create-sales-cliente-exemplo-campaign
description: Cria uma campanha de VENDAS (OUTCOME_SALES) SEMPRE PAUSED para o cliente-exemplo, dentro do teto, reusando os top criativos vencedores por compras (não recria criativos). Pixel PURCHASE; omite destination_type (Meta v25). Persiste no Supabase via REST + manifest + operation_logs. Headless e idempotente.
allowed-tools: Read, Write, Glob, Bash(npx tsx:*), mcp__claude_ai_META_ADS__ads_get_ad_accounts, mcp__claude_ai_META_ADS__ads_get_datasets, mcp__claude_ai_META_ADS__ads_get_creatives, mcp__claude_ai_META_ADS__ads_create_campaign, mcp__claude_ai_META_ADS__ads_create_ad_set, mcp__claude_ai_META_ADS__ads_create_ad
---

# create-sales-cliente-exemplo-campaign

Skill **headless** que cria uma campanha **OUTCOME_SALES PAUSED** reusando os **criativos vencedores**
(por compras) já existentes — **não gera novos criativos**. Persistência via **REST +
`SUPABASE_SECRET_KEY`** (nunca o MCP do Supabase). Ver ADR `0008-vendas-reusa-top-criativos` e os
gotchas em SPEC-000 §10.

## Regras invioláveis

- Campanha, ad_set e ads **nascem PAUSED** (ativação é a skill `activate-campaign-*`, separada).
- `daily_budget_cents` **≤ teto**; se teto = 0, **aborte** antes de qualquer escrita na Meta.
- **OUTCOME_SALES omite `destination_type`** (a chave não pode existir no payload — Meta v25).
- `promoted_object` com `pixel_id` + `custom_event_type='PURCHASE'`; otimização `OFFSITE_CONVERSIONS`.
- **Reuso**: cada ad aponta para um `meta_creative_id` existente; nada de recriar criativo.
- Idempotente: re-rodar com o mesmo stamp faz upsert por chave natural — não duplica gasto/linhas.

## Pré-condições

- Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. MCP da Meta conectado. Aborte se faltar.

## Fluxo

1. **Cliente** — `lista-de-clientes` (`SLUG=cliente-exemplo`); `parseClientRecord`; extraia `id`,
   `daily_budget_cap_cents`, `currency`, `ad_account_id`.
2. **Pixel** — descubra o pixel/dataset de PURCHASE da conta (`ads_get_datasets`). Sem pixel → **aborte**.
3. **Top criativos** — monte `CreativePerformance[]` cruzando `creatives` (id + `meta_creative_id`) com
   as compras atribuídas (dos `metric_snapshots`/`funnel_events` `purchase` da Onda 4, via `selectRows`).
   `selectTopCreatives(items, 3)` (`scripts/onda5/domain/top-creatives.ts`) escolhe os reutilizáveis.
4. **Plano** — `buildSalesPlan` (`scripts/onda5/application/sales-plan.ts`): valida pixel, **clampa o
   orçamento ao teto** e produz os payloads (sem `destination_type`). Se lançar, **aborte** sem tocar a Meta.

   ```bash
   npx tsx -e "
   import { buildSalesPlan } from './scripts/onda5/application/sales-plan.ts';
   import { buildSalesManifest, manifestPath } from './scripts/onda5/application/manifest.ts';
   // carregue { client, stamp, pixelId, topCreatives } de um JSON temporário e imprima { plan, manifest, path }
   "
   ```

5. **Idempotência** — antes de criar, consulte `campaigns` por (`client_id`, `name`); se já existir,
   **reuse** o `meta_campaign_id`.
6. **Cria na Meta (MCP), PAUSED**, persistindo cada passo (helpers da Onda 2 `upsertRow`/`insertRow`):
   - `ads_create_campaign` (`OUTCOME_SALES`, `status=PAUSED`) → upsert `campaigns`
     (`toSalesCampaignRow`, on_conflict `meta_campaign_id`) → `operation_logs` (`action='create'`).
   - `ads_create_ad_set` (`promoted_object` pixel PURCHASE, **sem** `destination_type`) → upsert
     `ad_sets` (`toSalesAdSetRow`) → `operation_logs`.
   - Para cada top criativo: `ads_create_ad` (`creative_id` = `meta_creative_id` existente,
     `status=PAUSED`) → upsert `ads` (`toSalesAdRow`, liga o `creative_id` do Supabase) → `operation_logs`.
7. **Manifest** — `tentativas-geracao-de-campanhas/<stamp>-sales.json` (`reusedCreativeIds`, `withinCap`).

## Critérios de aceite

Cria entidades **PAUSED** dentro do teto **reusando** criativos existentes (sem recriar); ad_set **sem**
`destination_type`; `operation_logs` por mutação; manifest escrito; re-rodar não duplica.
