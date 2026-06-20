-- Onda 1 — Auditoria e dashboard: operation_logs, agent_events, daily_summaries, lp_events (SPEC §6).
-- operation_logs / agent_events / lp_events são append-only (só created_at). lp_events é NO-PII.

create table public.operation_logs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.clients (id) on delete cascade,
  entity_type text not null,
  entity_id   text,
  action      public.operation_action not null,
  actor       text,
  summary     text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create table public.agent_events (
  id         uuid primary key default gen_random_uuid(),
  run_id     text not null,
  agent_name text,
  agent_type public.agent_type not null,
  event_type public.agent_event_type not null,
  tool_name  text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create table public.daily_summaries (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  summary_date date not null,
  summary      text,
  structured   jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, summary_date)
);

-- Espelho NO-PII dos eventos de tracking (SPEC §6/§11): só flags e dimensões, nunca dado pessoal.
create table public.lp_events (
  id              uuid primary key default gen_random_uuid(),
  event_id        text not null unique,
  landing_page_id uuid references public.landing_pages (id) on delete set null,
  event_type      text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_term        text,
  utm_content     text,
  country         text,
  value           numeric,
  currency        text,
  has_email       boolean not null default false,
  has_phone       boolean not null default false,
  created_at      timestamptz not null default now()
);

create index operation_logs_client_id_idx on public.operation_logs (client_id);
create index operation_logs_entity_idx on public.operation_logs (entity_type, entity_id);
create index agent_events_run_id_idx on public.agent_events (run_id);
create index daily_summaries_client_id_idx on public.daily_summaries (client_id);
create index lp_events_landing_page_id_idx on public.lp_events (landing_page_id);

create trigger set_updated_at before update on public.daily_summaries
  for each row execute function public.set_updated_at();
