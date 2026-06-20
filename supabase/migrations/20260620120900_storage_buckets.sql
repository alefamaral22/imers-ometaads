-- Onda 1 — Storage buckets (SPEC-000 §6/§10, ADR 0003).
-- creatives/nexus-review privados; landing-assets/ad-ingest públicos (a Meta busca a imagem do
-- criativo em ad-ingest). Idempotente para sobreviver a re-runs do db reset.

insert into storage.buckets (id, name, public)
values
  ('creatives',      'creatives',      false),
  ('nexus-review',   'nexus-review',   false),
  ('landing-assets', 'landing-assets', true),
  ('ad-ingest',      'ad-ingest',      true)
on conflict (id) do nothing;
