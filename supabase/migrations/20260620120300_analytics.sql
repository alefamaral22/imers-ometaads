-- Onda 1 — Analytics: analyses → metric_snapshots / analysis_findings / funnel_events (SPEC-000 §6).
-- Tabelas append-only (snapshots/findings/eventos): só created_at, nunca sofrem UPDATE.

create table public.analyses (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  objective         text,
  window_start      timestamptz,
  window_stop       timestamptz,
  compare_window    text,
  entities_analyzed integer,
  overall_verdict   public.analysis_verdict not null default 'no_data',
  summary           text,
  triggered_by      text,
  raw               jsonb,
  created_at        timestamptz not null default now()
);

create table public.metric_snapshots (
  id                     uuid primary key default gen_random_uuid(),
  analysis_id            uuid not null references public.analyses (id) on delete cascade,
  level                  public.metric_level not null,
  meta_entity_id         text,
  impressions            bigint,
  spend_cents            bigint,
  ctr                    numeric,
  cpc_cents              bigint,
  cpm_cents              bigint,
  landing_page_views     bigint,
  cplpv_cents            bigint,
  results                bigint,
  cost_per_result_cents  bigint,
  rankings               jsonb,
  raw                    jsonb,
  created_at             timestamptz not null default now()
);

create table public.analysis_findings (
  id                  uuid primary key default gen_random_uuid(),
  analysis_id         uuid not null references public.analyses (id) on delete cascade,
  severity            public.finding_severity not null default 'info',
  diagnosis           text not null,
  evidence            jsonb,
  recommended_action  text,
  recommendation_type text,
  confidence          numeric(4, 3) check (confidence >= 0 and confidence <= 1),
  is_significant      boolean not null default false,
  created_at          timestamptz not null default now()
);

create table public.funnel_events (
  id                   uuid primary key default gen_random_uuid(),
  analysis_id          uuid not null references public.analyses (id) on delete cascade,
  level                public.funnel_level not null,
  meta_entity_id       text,
  step_order           integer not null,
  event_type           public.funnel_event_type not null,
  count                bigint,
  value_cents          bigint,
  cost_per_event_cents bigint,
  cvr_from_prev        numeric,
  cvr_from_top         numeric,
  created_at           timestamptz not null default now()
);

create index analyses_client_id_idx on public.analyses (client_id);
create index metric_snapshots_analysis_id_idx on public.metric_snapshots (analysis_id);
create index analysis_findings_analysis_id_idx on public.analysis_findings (analysis_id);
create index funnel_events_analysis_id_idx on public.funnel_events (analysis_id);
