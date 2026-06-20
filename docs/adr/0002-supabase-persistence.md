# ADR 0002 — Persistência em Supabase Postgres como única fonte da verdade

- **Status:** Accepted
- **Data:** 2026-06-20
- **Onda:** 1

## Contexto

O sistema tem três planos **desacoplados** (dashboard na Vercel, runner headless no Fly.io, banco) que
só podem se comunicar por um canal compartilhado, sem webhooks nem chamadas inbound entre eles
(SPEC-000 §1/§3). Precisamos de um armazém transacional que: (a) sirva de fila de trabalho com claim
atômico sob concorrência; (b) imponha segurança no próprio dado (não só na aplicação); (c) tenha
schema versionado e reproduzível; (d) ofereça Storage para criativos e assets de LP; (e) seja
acessível tanto por skills headless (REST) quanto pelo dashboard (server-side).

## Decisão

Usamos **Supabase Postgres 16** como única fonte da verdade e único canal entre os planos. O schema é
definido por **migrations versionadas** em `supabase/migrations/` (ordem cronológica), aplicáveis com
`supabase db reset`. Toda tabela tem **RLS habilitado e deny-by-default** (sem policies; só o
`service_role`, que tem `BYPASSRLS`, acessa). Dinheiro é **inteiro de centavos**; IDs da Meta são
`text`; todo upsert guarda o payload cru em `raw_spec jsonb`. Um trigger `set_updated_at()` mantém
`updated_at`. Storage usa quatro buckets (`creatives`, `nexus-review` privados; `landing-assets`,
`ad-ingest` públicos).

## Consequências

- **Positivas:** segurança no dado (RLS), não só na app; reprodutibilidade total via migrations;
  um só canal simplifica o raciocínio sobre concorrência; Storage integrado.
- **Negativas / trade-offs:** acoplamento ao Postgres/Supabase; RLS deny-by-default exige que **toda**
  leitura seja server-side com `service_role` (nada direto do browser); enums fechados encarecem
  evoluções de domínio (precisam de migration).
- **Riscos & mitigação:** vazamento do `SUPABASE_SECRET_KEY` daria acesso total → segredo fora do
  código, só em `fly secrets`/Vercel env; `NEXT_PUBLIC_*` nunca carrega segredo.

## Alternativas consideradas

- **Broker de fila dedicado (SQS/Redis streams) + DB separado** — rejeitado: adiciona um segundo canal
  e mais infra; o claim atômico via `FOR UPDATE SKIP LOCKED` no Postgres já resolve (ver ADR 0009).
- **ORM com schema implícito** — rejeitado: migrations SQL explícitas são o contrato auditável e
  rodam igual em dev/CI/prod.
