# ADR 0026 — Multi-tenancy por `account_id` com isolamento server-side

- **Status:** Accepted
- **Data:** 2026-06-24
- **Onda:** 12 (SaaS multi-tenant)
- **Spec:** `docs/specs/SPEC-saas-multitenant.md`

## Contexto

O sistema nasceu single-operator (auth por senha única `DASHBOARD_PASSWORD`, Onda 6) e precisa virar
**SaaS multi-tenant**: várias empresas/usuários pagantes ("accounts"), cada uma com seus próprios
clientes, contas de anúncio e segredos, **sem que uma account veja dados de outra**. O projeto tem um
princípio inviolável (CLAUDE.md / `.claude/rules/security.md`): **RLS deny-by-default, só
`service_role` acessa, toda leitura é server-side**. Como o `service_role` tem `BYPASSRLS`, políticas
de RLS "por account" **não atuam** no caminho de leitura atual — o isolamento precisa de uma decisão
explícita.

## Decisão

Introduzimos a tabela **`accounts`** (o tenant) e amarramos **`clients.account_id`** (NOT NULL, FK
cascade). O `slug` do cliente deixa de ser único global e passa a `unique(account_id, slug)`; o
`ad_account_id` segue **único global** (anti-hijack: uma conta de anúncio Meta = um único tenant).
`agent_jobs` ganha `account_id` denormalizado (preenchido no enqueue) para o runner resolver o tenant
sem join. `role` mora na própria account (`super_admin`/`socio`/`cliente_usuario`); 1 account ≈ 1
login no MVP (memberships multi-usuário = fase 2).

**Isolamento (Opção A — escopo na aplicação):** mantemos o caminho `service_role` + leitura
server-side. Toda query de tenant passa por um **único acessador escopado** (`withAccount(accountId)`)
que injeta `account_id` (direto ou via `client_id`) em toda leitura/escrita; `super_admin` desliga o
filtro (vê tudo). O isolamento é garantido por esse choke-point único + testes que falham se uma query
de tenant esquecer o filtro. As demais tabelas de domínio escopam por `client_id → account_id` (join);
o schema já carrega `account_id` nas tabelas-dona, de forma que **RLS real (Opção B) vira um add sem
migration** depois.

## Consequências

- **Positivas:** casa com a arquitetura atual (sem flip para JWT/leitura no browser); custo baixo;
  schema pronto para ligar RLS por account (GUC + role não-bypass) depois sem migration; anti-hijack do
  `ad_account_id` no banco.
- **Negativas / trade-offs:** no MVP a *enforcement* operante é a aplicação, não o banco — um
  `.eq('account_id', …)` esquecido é vazamento cross-tenant; mitigado por choke-point único + testes.
  `account_id` denormalizado em `agent_jobs` exige preenchimento correto no enqueue.
- **Riscos & mitigação:** filtro esquecido → `withAccount` como única porta + teste de isolamento;
  backfill de produção → account-âncora `acme` (super_admin) amarra os `clients`/`jobs` existentes na
  própria migration.

## Alternativas consideradas

- **Opção B — RLS real já agora (role Postgres sem `BYPASSRLS` + `SET LOCAL app.current_account` +
  policies `using (account_id = current_setting(...))`)** — mais robusta (o banco barra bug de app),
  mas adiciona role novo, plumbing de conexão e revisão de todas as policies. Adiada como **fast-follow**
  documentado; o schema já a viabiliza sem migration.
- **Supabase Auth + JWT lido no browser com RLS por claim** — rejeitada: contraria o princípio "toda
  leitura é server-side; nada direto do browser".
- **Role em tabela de memberships (users×accounts) desde já** — adiada (fase 2); MVP põe `role` na
  account (1 login por account).
