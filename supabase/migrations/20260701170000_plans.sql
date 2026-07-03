-- Onda A — Planos como entidade configurável (SPEC docs/specs/SPEC-planos-configuraveis.md; ADR 0034).
-- Aditiva sobre o banco vivo: cria a tabela `plans` (nome/preço/limites configuráveis), o histórico
-- `plan_changes`, e liga accounts.plan_id por FK. A coluna enum legada accounts.plan PERMANECE (não
-- dropar em banco vivo); o backfill casa plan_id por slug. Money em centavos int; RLS deny-by-default.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) plans — o catálogo comercial. Limites nullable = ilimitado. features (jsonb) = flags do plano.
--    is_active = soft-delete (nunca hard-delete: uma account pode apontar para um plano aposentado).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.plans (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  name               text not null,
  price_cents        integer not null default 0 check (price_cents >= 0),
  currency           text not null default 'BRL',
  trial_days         integer not null default 0 check (trial_days >= 0),
  max_clients        integer check (max_clients is null or max_clients >= 0),
  max_landing_pages  integer check (max_landing_pages is null or max_landing_pages >= 0),
  max_campaigns      integer check (max_campaigns is null or max_campaigns >= 0),
  max_users          integer check (max_users is null or max_users >= 0),
  features           jsonb not null default '{}'::jsonb,
  is_active          boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) accounts.plan_id — FK aditiva/nullable. on delete restrict: não deixa apagar um plano em uso
--    (some plano ≠ some tenant). A coluna enum `plan` fica como legado até fase futura.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.accounts
  add column plan_id uuid references public.plans (id) on delete restrict;
create index accounts_plan_id_idx on public.accounts (plan_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) plan_changes — trilha de auditoria de troca de plano por account. from_plan_id null na primeira
--    atribuição. changed_by = slug do ator (super_admin), coerente com operation_logs.actor.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.plan_changes (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  from_plan_id  uuid references public.plans (id) on delete set null,
  to_plan_id    uuid not null references public.plans (id) on delete restrict,
  changed_by    text not null,
  reason        text,
  created_at    timestamptz not null default now()
);
create index plan_changes_account_id_idx on public.plan_changes (account_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Seed dos 4 planos legados (slug casa com o enum account_plan) + backfill de accounts.plan_id.
--    Limites/preços default sensatos; o super_admin edita depois pela UI. trial só no plano 'trial'.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.plans (slug, name, price_cents, trial_days, max_clients, max_landing_pages, max_campaigns, max_users, sort_order)
values
  ('trial',   'Trial',    0,      14, 1,    1,    1,    1,    0),
  ('starter', 'Starter',  9700,   0,  3,    5,    10,   2,    1),
  ('pro',     'Pro',      29700,  0,  10,   25,   50,   5,    2),
  ('agency',  'Agency',   99700,  0,  null, null, null, null, 3)
on conflict (slug) do nothing;

update public.accounts a
   set plan_id = p.id
  from public.plans p
 where p.slug = a.plan::text
   and a.plan_id is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RLS deny-by-default (só service_role acessa; leitura sempre server-side — ADR 0026). O trigger
--    rls_auto_enable já liga RLS em tabela nova de public; declaramos explícito como contrato.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.plans        enable row level security;
alter table public.plan_changes enable row level security;
