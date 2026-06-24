# 0031 — Isolamento das leituras operacionais por account

- **Status:** Accepted
- **Data:** 2026-06-24
- **Onda:** 15
- **Contexto relacionado:** ADR 0026 (multi-tenancy app-layer / Opção A), 0029 (auth por account),
  SPEC `docs/specs/SPEC-isolamento-leituras-operacionais.md`.

## Contexto

As Ondas 12/13 aplicaram `scopeEq` só às tabelas do cofre. As leituras operacionais antigas (`clients`,
`campaigns`, `analyses`, `funnel_events`, `landing_pages`, `operation_logs`) seguiam globais. Um
`cliente_usuario` recém-criado via os dados da agência inteira — vazamento entre tenants. (Confirmado:
account `teste` com 0 clientes via os 3 PAUSED e o Cliente Exemplo do `acme`.)

## Decisão

1. **Plugar `scopeEq` em todas as leituras operacionais.** `clients` filtra direto por `account_id`;
   as tabelas filhas filtram por `client_id IN (client_ids da account)` via `accountClientIds(scope)`.
2. **Decisão de filtro pura e testável** (`clientScopeFilter`): `null`→`all` (global), `[]`→`none`
   (restrito sem clientes ⇒ resultado vazio, **nunca** "sem filtro"), lista→`in`. O `none` é o
   curto-circuito que mata a causa-raiz do bug.
3. **`getClientBySlug` passa a receber o escopo**: um cliente que tente abrir o detalhe de outra account
   recebe `notFound` (não confirma a existência por 403 vs 404).
4. **Nexus e editor de landing = agência-only.** `/api/nexus/*` e `/api/landing/*` exigem visibilidade
   global; o widget do Nexus some para `cliente_usuario`. As leituras internas do Nexus usam
   `AGENCY_SCOPE` (global) — coerente, já que só a agência acessa.
5. **Sem migration, sem mudar o runner** — só o caminho de leitura do dashboard.

## Consequências

**Positivas:** fecha o vazamento entre tenants; mantém a Opção A (um só choke-point por leitura); risco
baixo (só leitura); zero mudança de schema/runner; a decisão central é pura e coberta por teste de
regressão.

**Negativas / dívidas aceitas:** o filtro das tabelas filhas faz **2 idas ao banco** (resolver client_ids
+ a query) — aceitável na escala atual; se virar gargalo, denormalizar `account_id` nessas tabelas (com
migração + backfill + skills do runner gravando `account_id`). O Nexus não é multi-tenant: é bloqueado
para clientes em vez de escopado — quando um cliente precisar de um co-piloto, será uma superfície nova.

## Alternativas consideradas

- **Denormalizar `account_id`** em campaigns/analyses/landing/logs — rejeitado por ora: migração +
  backfill + mudar o runner headless; mais invasivo que o ganho atual.
- **RLS por account nas leituras** — rejeitado: `service_role` bypassa RLS (ADR 0026).
- **Tenant-scopear todo o Nexus** — adiado: grande e arriscado; Nexus é ferramenta de agência hoje.
