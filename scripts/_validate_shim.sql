-- Shim local: recria o que o Supabase já provê, para validar as migrations num Postgres puro.
-- NÃO é uma migration do projeto; usado só pelo validador local (Docker).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);
