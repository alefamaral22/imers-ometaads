-- Onda 1 — Landing pages: products → landing_pages → landing_page_sections (SPEC-000 §6).
-- Conteúdo vive no banco (settings/theme + sections.fields), não em arquivos; criar nasce noindex=true.

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  slug              text not null,
  name              text not null,
  brief_path        text,
  brief             jsonb,
  default_subdomain text,
  status            text not null default 'draft',
  raw_spec          jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (client_id, slug)
);

create table public.landing_pages (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients (id) on delete cascade,
  product_id          uuid references public.products (id) on delete set null,
  subdomain           text not null unique,
  fqdn                text,
  url                 text,
  content_spec        jsonb,
  tracking            jsonb,
  theme               jsonb,
  settings            jsonb,
  checkout_url        text,
  price_cents         integer check (price_cents >= 0),
  cart_state          public.cart_state not null default 'closed',
  noindex             boolean not null default true,
  ssl_status          text,
  status              public.lp_status not null default 'draft',
  draft_status        public.lp_draft_status not null default 'empty',
  published_snapshot  jsonb,
  repo_path           text,
  cloudflare_project_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.landing_page_sections (
  id              uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages (id) on delete cascade,
  type            text not null,
  position        integer not null default 0,
  enabled         boolean not null default true,
  fields          jsonb,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (landing_page_id, type)
);

create index products_client_id_idx on public.products (client_id);
create index landing_pages_client_id_idx on public.landing_pages (client_id);
create index landing_pages_product_id_idx on public.landing_pages (product_id);
create index landing_page_sections_landing_page_id_idx
  on public.landing_page_sections (landing_page_id);

create trigger set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.landing_pages
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.landing_page_sections
  for each row execute function public.set_updated_at();
