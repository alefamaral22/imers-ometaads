-- Onda 16 — Snapshot ao vivo da Meta para o Nexus (SPEC-016; ADR 0032).
-- Perna LEVE do modelo híbrido: o Nexus enfileira um job read-only (kind 'snapshot'); o runner lê a
-- Meta via MCP (acesso que já existe), calcula métricas + alertas e grava UMA linha aqui; o dashboard
-- lê o snapshot (escopado por account) e o Nexus narra. Nenhum token Meta entra no plano do dashboard.
-- Aditiva sobre o banco vivo. Money em centavos int; IDs Meta em text; RLS deny-by-default.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Novo valor do enum da fila. 'snapshot' é read-only por natureza (não liga gasto). Adicionado
--    isolado (não é usado nesta mesma migration — só agent_jobs.kind o referencia em runtime).
-- ─────────────────────────────────────────────────────────────────────────────
alter type public.job_kind add value if not exists 'snapshot';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) live_snapshots — append-only, 1 linha por job (idempotência por job_id unique). payload guarda
--    o snapshot compacto (métricas por campanha + alertas), validado por Zod no servidor antes de
--    persistir. SEM PII (só métricas agregadas e dimensões). Dinheiro em centavos no payload.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.live_snapshots (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  job_id      uuid not null references public.agent_jobs (id) on delete cascade,
  period      text not null default 'last_7d',
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  unique (job_id)
);

-- Leitura mais comum: "último snapshot deste cliente" (escopo por account já no service).
create index live_snapshots_client_created_idx
  on public.live_snapshots (client_id, created_at desc);
create index live_snapshots_account_id_idx on public.live_snapshots (account_id);

-- RLS deny-by-default (o event trigger rls_auto_enable já liga em toda tabela nova; explícito aqui
-- por convenção — idempotente). Só service_role acessa; toda leitura é server-side e escopada.
alter table public.live_snapshots enable row level security;
