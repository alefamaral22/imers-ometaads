-- Onda 13 — Auth por account (SPEC docs/specs/SPEC-auth-por-account.md; ADR 0029).
-- Credencial de login na própria accounts (1 login por account no MVP). Aditiva: colunas nullable.
-- email é o identificador (citext = único case-insensitive); password_hash NUNCA em texto puro
-- (scrypt: 'scrypt$<saltHex>$<hashHex>'); nunca volta ao front. Backfill da âncora fica para um
-- reset único (até lá, o login do super_admin cai no bootstrap legado por DASHBOARD_PASSWORD).

create extension if not exists citext;

alter table public.accounts add column email         citext unique;
alter table public.accounts add column password_hash text;
alter table public.accounts add column last_login_at timestamptz;
