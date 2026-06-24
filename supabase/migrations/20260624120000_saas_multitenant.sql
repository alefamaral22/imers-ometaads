-- Onda 12 — SaaS multi-tenant (SPEC docs/specs/SPEC-saas-multitenant.md; ADR 0026/0027/0028).
-- Aditiva + backfill seguro sobre o banco vivo. Money em centavos int; IDs Meta em text; segredos
-- SEMPRE cifrados em repouso (AES-256-GCM app-level; chave nunca no banco); RLS deny-by-default.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Enums novos (domínios fechados). oauth_meta entra no enum SEM código atrás (decisão consciente:
--    OAuth oficial da Meta exige Business Verification + App Review = fase 2). Ver SPEC §4.3.
-- ─────────────────────────────────────────────────────────────────────────────
create type public.account_role        as enum ('super_admin', 'socio', 'cliente_usuario');
create type public.account_plan        as enum ('trial', 'starter', 'pro', 'agency');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'paused');
create type public.connection_method   as enum ('manual_token', 'oauth_meta');
create type public.connection_status   as enum ('unverified', 'active', 'invalid', 'revoked');
create type public.api_key_provider    as enum ('anthropic', 'openai', 'elevenlabs', 'minimax', 'other');
create type public.api_key_status      as enum ('unverified', 'active', 'invalid');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) accounts — o tenant (empresa/usuário pagante). role mora aqui (1 account ≈ 1 login no MVP;
--    memberships multi-usuário = fase 2). Billing/auth só ganchos (integração depois).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.accounts (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  name                text not null,
  role                public.account_role not null default 'cliente_usuario',
  plan                public.account_plan not null default 'trial',
  subscription_status public.subscription_status not null default 'trialing',
  billing_customer_id text,
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  auth_user_id        uuid unique,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger set_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) ad_account_connections — 1 linha por conta de anúncio Meta conectada.
--    Token manual (System User) SEMPRE cifrado em access_token_cipher; nunca texto puro; nunca volta
--    ao front (UI mostra só last4 + datas). Decifrar só server-side no instante de chamar a Meta.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.ad_account_connections (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null references public.accounts (id) on delete cascade,
  client_id             uuid references public.clients (id) on delete set null,
  meta_ad_account_id    text not null,
  business_manager_id   text,
  connection_method     public.connection_method not null default 'manual_token',
  access_token_cipher   bytea,                       -- AES-256-GCM (iv||tag||ciphertext); null se != manual_token
  access_token_last4    text,
  token_label           text,
  key_version           smallint not null default 1,
  oauth_meta_user_id    text,                        -- placeholder fase 2 (sem uso no MVP)
  status                public.connection_status not null default 'unverified',
  last_validated_at     timestamptz,
  last_validation_error text,
  connected_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Anti-hijack: ≤1 conexão "viva" por conta de anúncio Meta no mundo. Revogada pode ser reconectada.
create unique index ad_account_connections_meta_active_uidx
  on public.ad_account_connections (meta_ad_account_id)
  where status in ('unverified', 'active');

create index ad_account_connections_account_id_idx on public.ad_account_connections (account_id);
create index ad_account_connections_client_id_idx  on public.ad_account_connections (client_id);

create trigger set_updated_at before update on public.ad_account_connections
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) api_keys_clientes — chaves de provedor por account, cifradas em repouso, nunca devolvidas ao
--    front (só key_last4). Regra de uso fora do super_admin: chave própria obrigatória (SPEC §5.2).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.api_keys_clientes (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts (id) on delete cascade,
  provider          public.api_key_provider not null,
  label             text,
  key_cipher        bytea not null,                  -- AES-256-GCM; nunca texto puro
  key_last4         text,
  key_version       smallint not null default 1,
  status            public.api_key_status not null default 'unverified',
  last_validated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (account_id, provider)
);

create index api_keys_clientes_account_id_idx on public.api_keys_clientes (account_id);

create trigger set_updated_at before update on public.api_keys_clientes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) clients ganha account_id (nullable no passo 1; NOT NULL após backfill).
--    agent_jobs ganha account_id (conveniência do runner: resolve chaves do tenant sem join).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.clients
  add column account_id uuid references public.accounts (id) on delete cascade;
create index clients_account_id_idx on public.clients (account_id);

alter table public.agent_jobs
  add column account_id uuid references public.accounts (id) on delete cascade;
create index agent_jobs_account_id_idx on public.agent_jobs (account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Backfill: account-âncora da agência (super_admin) + amarra clients/jobs órfãos a ela.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.accounts (slug, name, role, plan, subscription_status)
values ('acme', 'Acme (agência)', 'super_admin', 'agency', 'active')
on conflict (slug) do nothing;

update public.clients
   set account_id = (select id from public.accounts where slug = 'acme')
 where account_id is null;

update public.agent_jobs j
   set account_id = c.account_id
  from public.clients c
 where j.client_id = c.id
   and j.account_id is null;

-- clients sempre pertence a uma account; agent_jobs.account_id fica nullable (jobs podem não ter client).
alter table public.clients alter column account_id set not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) slug do client deixa de ser único global e passa a ser único POR account.
--    ad_account_id CONTINUA único global (uma conta de anúncio Meta = um único tenant).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.clients drop constraint clients_slug_key;
alter table public.clients add constraint clients_account_slug_uniq unique (account_id, slug);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) RLS deny-by-default nas tabelas novas (só service_role acessa; isolamento de tenant é
--    server-side via withAccount() no MVP — ver SPEC §5.1 / ADR 0026).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.accounts               enable row level security;
alter table public.ad_account_connections enable row level security;
alter table public.api_keys_clientes      enable row level security;
