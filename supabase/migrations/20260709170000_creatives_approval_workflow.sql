-- Criativos: status de aprovação, fonte (ai/manual/trafegante), campos de revisão.
-- Idempotente: ADD COLUMN IF NOT EXISTS.

alter table public.creatives
  add column if not exists account_id uuid references public.accounts(id),
  add column if not exists status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','rejected','archived')),
  add column if not exists source text not null default 'manual'
    check (source in ('manual','ai','trafegante')),
  add column if not exists prompt text,
  add column if not exists feedback text,
  add column if not exists reviewed_by uuid references public.accounts(id),
  add column if not exists reviewed_at timestamptz;

alter table public.generated_images
  add column if not exists account_id uuid references public.accounts(id),
  add column if not exists client_id uuid references public.clients(id) on delete cascade;

create index if not exists creatives_account_id_idx on public.creatives (account_id);
create index if not exists creatives_status_idx on public.creatives (status);
create index if not exists generated_images_account_id_idx on public.generated_images (account_id);
create index if not exists generated_images_client_id_idx on public.generated_images (client_id);
