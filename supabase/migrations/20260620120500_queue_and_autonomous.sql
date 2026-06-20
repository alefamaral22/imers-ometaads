-- Onda 1 — Fila agent_jobs + modo autônomo (SPEC-000 §6/§10, ADR 0009).
-- Dedup por índices únicos parciais: ≤1 job ativo por (client_id,kind) e por (landing_page_id,kind).

create table public.agent_jobs (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references public.clients (id) on delete cascade,
  landing_page_id uuid references public.landing_pages (id) on delete set null,
  skill           text not null,
  kind            public.job_kind not null,
  args            jsonb not null default '{}'::jsonb,
  status          public.job_status not null default 'pending',
  requested_by    text not null default 'nexus',
  claimed_by      text,
  claimed_at      timestamptz,
  started_at      timestamptz,
  finished_at     timestamptz,
  attempts        integer not null default 0,
  exit_code       integer,
  result          jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Idempotência da fila: no máximo um job "ativo" por alvo+kind.
create unique index agent_jobs_active_client_kind_uidx
  on public.agent_jobs (client_id, kind)
  where status in ('pending', 'claimed', 'running');

create unique index agent_jobs_active_landing_kind_uidx
  on public.agent_jobs (landing_page_id, kind)
  where status in ('pending', 'claimed', 'running');

-- Suporta o ORDER BY do claim (FIFO entre pendentes).
create index agent_jobs_status_created_idx on public.agent_jobs (status, created_at);

create table public.autonomous_watches (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid references public.clients (id) on delete cascade,
  target_kind            text not null,
  target_id              uuid,
  agent_job_id           uuid references public.agent_jobs (id) on delete set null,
  publish_job_id         uuid references public.agent_jobs (id) on delete set null,
  session_id             text,
  phase                  public.watch_phase not null default 'watching',
  last_event_ts          timestamptz,
  last_narrated_milestone text,
  locked_by              text,
  last_ticked_at         timestamptz,
  result                 jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Suporta o claim de watches ativos (não done/failed).
create index autonomous_watches_phase_idx
  on public.autonomous_watches (phase, updated_at)
  where phase in ('watching', 'reviewing', 'notifying');

-- Append-only: narrações faladas pelo Nexus (1 por tick).
create table public.nexus_narrations (
  id         uuid primary key default gen_random_uuid(),
  watch_id   uuid references public.autonomous_watches (id) on delete cascade,
  session_id text,
  text       text not null,
  kind       public.narration_kind not null default 'status',
  image_path text,
  spoken_at  timestamptz,
  created_at timestamptz not null default now()
);

create index nexus_narrations_watch_id_idx on public.nexus_narrations (watch_id);

create trigger set_updated_at before update on public.agent_jobs
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.autonomous_watches
  for each row execute function public.set_updated_at();
