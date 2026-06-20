-- Onda 1 — Seed: um cliente de template (SPEC-000 §6). Idempotente para sobreviver a db reset.
-- Placeholders do template (trocar pelos seus depois): slug cliente-exemplo, domínio example.com.

insert into public.clients (slug, name, default_landing_url, daily_budget_cap_cents, currency, materials_path)
values (
  'cliente-exemplo',
  'Cliente Exemplo',
  'https://cliente-exemplo.example.com',
  5000,
  'BRL',
  '.claude/materiais-das-empresas/cliente-exemplo'
)
on conflict (slug) do nothing;
