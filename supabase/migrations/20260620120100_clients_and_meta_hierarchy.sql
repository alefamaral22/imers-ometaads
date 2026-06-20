-- Onda 1 — Conta e hierarquia Meta: clients → campaigns → ad_sets → ads (SPEC-000 §6).
-- Money em inteiro de centavos; IDs externos da Meta em text; raw_spec guarda o payload cru.

create table public.clients (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  ad_account_id          text unique,
  business_manager_id    text,
  facebook_page_id       text,
  default_landing_url    text,
  daily_budget_cap_cents integer not null default 5000 check (daily_budget_cap_cents >= 0),
  currency               text not null default 'BRL',
  materials_path         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.campaigns (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients (id) on delete cascade,
  meta_campaign_id     text unique,
  name                 text not null,
  objective            text not null,
  budget_mode          public.budget_mode,
  daily_budget_cents   integer check (daily_budget_cents >= 0),
  status               public.entity_status not null default 'PAUSED',
  special_ad_categories text[] not null default '{}',
  raw_spec             jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.ad_sets (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references public.campaigns (id) on delete cascade,
  meta_ad_set_id       text unique,
  name                 text not null,
  optimization_goal    text,
  billing_event        text,
  destination_type     text,
  daily_budget_cents   integer check (daily_budget_cents >= 0),
  targeting            jsonb,
  advantage_audience   boolean,
  advantage_placements boolean,
  status               public.entity_status not null default 'PAUSED',
  raw_spec             jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- creative_id é FK criada na migration de criativos (ordem cronológica) para evitar dependência
-- circular; aqui declaramos a coluna e adicionamos a constraint depois.
create table public.ads (
  id               uuid primary key default gen_random_uuid(),
  ad_set_id        uuid not null references public.ad_sets (id) on delete cascade,
  creative_id      uuid,
  meta_ad_id       text unique,
  name             text not null,
  status           public.entity_status not null default 'PAUSED',
  effective_status text,
  raw_spec         jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index ads_creative_id_idx on public.ads (creative_id);
create index campaigns_client_id_idx on public.campaigns (client_id);
create index ad_sets_campaign_id_idx on public.ad_sets (campaign_id);
create index ads_ad_set_id_idx on public.ads (ad_set_id);

create trigger set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ad_sets
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ads
  for each row execute function public.set_updated_at();
