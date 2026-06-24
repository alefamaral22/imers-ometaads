# SPEC — Isolamento das leituras operacionais por account (Onda 15)

- **Status:** Approved-design
- **Ondas anteriores:** 12 (multi-tenant: schema + cofre), 13 (login por account), 14 (provisionamento).
- **ADR:** [0031](../adr/0031-isolamento-leituras-operacionais.md) (e 0026 para a Opção A).
  **Threat model:** [`isolamento-leituras-operacionais.md`](../security/threats/isolamento-leituras-operacionais.md).

## 1. Problema (bug de isolamento)

As Ondas 12/13 ligaram o escopo por account **só nas tabelas novas do cofre** (`ad_account_connections`,
`api_keys_clientes`). Todas as leituras **operacionais antigas** — `clients`, `campaigns`, `analyses`,
`funnel_events`, `landing_pages`, `operation_logs` — continuaram lendo **tudo, sem filtro de account**.

Resultado observado: uma conta `cliente_usuario` recém-criada (`teste`, 0 clientes) logava e via os
clientes/campanhas/atividade da agência inteira. **Vazamento entre tenants** — um cliente pagante veria
os dados de outro. O modelo de dados está correto (`clients.account_id` preenchido); o furo é só no
caminho de leitura.

## 2. Objetivo

Plugar o choke-point de escopo (`scopeEq`, ADR 0026) em **todas** as leituras operacionais, de modo que:

- `super_admin`/`socio` (visibilidade global) continuam vendo tudo;
- `cliente_usuario` só vê os recursos da **própria** account (clientes da account + campanhas/análises/
  landing/logs desses clientes).

Sem migration (as colunas já existem). Sem mudança no runner headless (só o lado de leitura do dashboard).

## 3. Como o escopo se propaga

`clients` tem `account_id` → escopo direto (`scopeEq`). As demais tabelas pertencem a um `client_id`
(que pertence a uma account), então o escopo delas vem dos **client_ids da account**:

- `accountClientIds(scope)` → `null` (global) **ou** lista de ids da account.
- `clientScopeFilter(ids)` (puro) → `all` (global) | `none` (restrito sem clientes → **resultado vazio**,
  curto-circuito anti-vazamento) | `in` (filtra `client_id IN (...)`).

`funnel_events` é escopado pela análise (que já vem escopada por `getLatestAnalysis(scope)`).

## 4. Nexus e editor de landing = ferramentas da agência

O Nexus (lê dados globais, enfileira jobs, **cria campanhas**) e o editor de landing/modo autônomo são
operações da agência. Em vez de re-escrever todo o `chat-runner` para multi-tenant, decidimos **barrar
`cliente_usuario`**: a API `/nexus/*` e `/landing/*` exige visibilidade global, e o widget do Nexus some
no Shell. As leituras internas do Nexus usam `AGENCY_SCOPE` (global), coerente com "só agência acessa".

## 5. Trade-offs (decididos)

| Decisão | Escolha | Porquê / alternativa rejeitada |
|---|---|---|
| Escopo das tabelas filhas | **client_ids da account** (app-layer, 2 passos) | Sem migration nem tocar no runner. Alternativa (denormalizar `account_id` em todas) = migração + backfill + mudar skills do runner. |
| Restrito sem clientes | `none` → **lista vazia sem ir ao banco** | Nunca degradar para "sem filtro" (causa-raiz do bug). |
| Detalhe de cliente fora do escopo | `getClientBySlug(scope,…)` → **notFound** | Não confirma a existência do recurso de outra account (não vaza por 403 vs 404). |
| Nexus/landing p/ cliente | **bloquear** (agência-only) | Ferramentas de operação; tenant-scopear todo o Nexus seria grande e arriscado. |
| Onde mora o isolamento | app-layer (`scopeEq`) | service_role bypassa RLS (ADR 0026, Opção A). |

## 6. Critérios de aceite

- `lint` + `typecheck` (root+web) + `test` + `format` verdes; `cd web && npm run build` verde.
- Teste de regressão (red→green): `clientScopeFilter([])` = `none` (restrito sem clientes ⇒ vazio),
  nunca `all`.
- `cliente_usuario` (`teste`, 0 clientes) vê `/`, `/analyses`, `/funnel`, `/landing-pages` **zerados**
  e não enxerga o widget do Nexus; `super_admin` continua vendo tudo.
- `GET /api/data/{clients,campaigns,analyses,funnel,landing-pages,logs}` escopados por sessão;
  `/api/data/clients/:slug` de outra account → 404; `/api/nexus/*` e `/api/landing/*` → 403 p/ cliente.
