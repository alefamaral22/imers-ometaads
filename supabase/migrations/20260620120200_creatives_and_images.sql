-- Onda 1 — Criativos e imagens geradas (SPEC-000 §6).
-- A Meta busca a imagem do criativo no bucket público ad-ingest (ADR 0003); o caminho de storage
-- da imagem gerada é único para evitar reuso acidental do mesmo arquivo.

create table public.generated_images (
  id                 uuid primary key default gen_random_uuid(),
  storage_bucket     text not null,
  storage_path       text not null,
  width              integer check (width > 0),
  height             integer check (height > 0),
  model              text,
  prompt             text,
  aspect             text,
  cost_usd_estimate  numeric(10, 4),
  raw_spec           jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table public.creatives (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid references public.clients (id) on delete cascade,
  meta_creative_id    text unique,
  name                text,
  headline            text,
  primary_text        text,
  description         text,
  call_to_action_type text,
  link_url            text,
  image_url           text,
  page_id             text,
  generated_image_id  uuid references public.generated_images (id) on delete set null,
  raw_spec            jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Fecha a FK reaproveitável ads.creative_id (criativos vencedores são reusados em campanhas de vendas).
alter table public.ads
  add constraint ads_creative_id_fkey
  foreign key (creative_id) references public.creatives (id) on delete set null;

create index creatives_generated_image_id_idx on public.creatives (generated_image_id);
create index creatives_client_id_idx on public.creatives (client_id);

create trigger set_updated_at before update on public.generated_images
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.creatives
  for each row execute function public.set_updated_at();
