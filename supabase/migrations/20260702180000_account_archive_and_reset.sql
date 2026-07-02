-- Etapa "super-admin completo" — arquivamento irreversível de account (soft, nunca hard-delete;
-- ADR 0030 já rejeitou hard-delete) + coluna para o operador registrar quem/quando redefiniu a
-- senha de um cliente. Aditiva; sem backfill necessário (ambas nullable).

alter table public.accounts
  add column archived_at timestamptz;

-- Contas arquivadas nunca fazem login, mesmo que is_active continue true por engano — cinto e
-- suspensório, já que a query de login também passa a filtrar archived_at is null no serviço.
create index accounts_archived_at_idx on public.accounts (archived_at) where archived_at is not null;
