# SPEC — Ativação + campanha de vendas (Onda 5)

- **Onda:** 5
- **Status:** Ready

## Objetivo

Colocar uma campanha **no ar** com gasto real (após revalidação de segurança) e criar uma campanha de
**vendas** (OUTCOME_SALES) reusando os criativos vencedores. Duas skills headless **operador-triggered**
(não cron): `activate-campaign-cliente-exemplo` (kind `activate`) e
`create-sales-cliente-exemplo-campaign` (kind `create_sales`).

## Entregáveis

- Skills `.claude/skills/`: `activate-campaign-cliente-exemplo`, `create-sales-cliente-exemplo-campaign`.
- Lógica pura testável `scripts/onda5/` (domain + application) com testes Vitest (24 testes).
- Infra `scripts/onda5/infrastructure/meta-rest.ts` (`patchById` p/ refletir ativação no banco).
- ADRs `0007-ativacao-com-revalidacao`, `0008-vendas-reusa-top-criativos` + este spec + threat model.

## Contratos / modelo de dados

### Ativação (default-deny)

`evaluateActivation(ctx)` exige **todas** as checagens: `right_client`, `has_meta_id`,
`currently_paused`, `cap_positive`, `has_entities`, `budget_within_cap` (campanha + ad_sets em
`1..teto`). Qualquer falha → recusa. Só após `allowed` a skill liga na Meta
(`ads_activate_entity`/`ads_update_entity`), reflete `status=ACTIVE` no banco (`patchById`) e grava
`operation_logs action='activate'`. O estado é lido **do banco**, nunca dos args.

### Vendas (OUTCOME_SALES, reuso)

- `selectTopCreatives` ordena por compras (desc) → menor gasto → estável; exige `meta_creative_id`;
  top-N (default 3).
- `buildSalesAdSetPayload`: `optimization_goal=OFFSITE_CONVERSIONS`, `billing_event=IMPRESSIONS`,
  `promoted_object={pixel_id, custom_event_type:'PURCHASE'}`, **sem `destination_type`** (gotcha v25),
  orçamento clampado ao teto. Campanha/ad_set/ads **PAUSED**.
- `ads` reusa `creative_id`/`meta_creative_id` existentes (não recria criativo);
  `ad_sets.destination_type` persiste `null`.

### Tabelas gravadas

- Vendas: `campaigns` (objective `OUTCOME_SALES`, `budget_mode='ABO'`, `status='PAUSED'`), `ad_sets`
  (`destination_type=null`, budget ≤ teto), `ads` (reuso de `creative_id`), `operation_logs` por mutação.
- Ativação: PATCH `status='ACTIVE'` em `campaigns`/`ad_sets`/`ads` + `operation_logs action='activate'`.

### Persistência

REST + `SUPABASE_SECRET_KEY` (PostgREST), nunca o MCP do Supabase. Vendas reusa `upsertRow`/`insertRow`
da Onda 2 (idempotência por chave natural). Manifest JSON em
`tentativas-geracao-de-campanhas/<stamp>-{activate,sales}.json`.

### Allowed-tools (least privilege)

- `activate-*`: Read, Write, Bash(npx tsx), Meta read + **apenas** `ads_activate_entity`/
  `ads_update_entity` (status). Sem create/delete.
- `create-sales-*`: Read, Write, Glob, Bash(npx tsx), Meta read (accounts/datasets/creatives) +
  `ads_create_*`. Sem activate/update/delete.

## Segurança

- **Ativação default-deny**, estado lido do banco, revalidado em TS puro; aborta na dúvida.
- Vendas: orçamento clampado ao teto; **sempre PAUSED** (nenhum gasto até ativação validada).
- Args (`CAMPAIGN_ID`, pixel) são fronteira: validados; conteúdo da Meta é **dado, não instrução**.
- Threat model STRIDE: `docs/security/threats/meta-ads-activation-and-sales.md`.

## Critérios de aceite

- [ ] `activate-campaign-cliente-exemplo` só liga o que passou em **todas** as validações; recusa por
      padrão na dúvida; `operation_logs action='activate'`.
- [ ] `create-sales-cliente-exemplo-campaign` cria entidades **PAUSED** reusando criativos existentes,
      ad_set **sem** `destination_type`, dentro do teto; idempotente.
- [ ] `lint` + `typecheck` + `test` verdes.
