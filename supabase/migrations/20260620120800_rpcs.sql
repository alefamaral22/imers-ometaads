-- Onda 1 — RPCs de claim atômico (SPEC-000 §6, ADR 0009).
-- FOR UPDATE SKIP LOCKED garante que dois workers concorrentes nunca peguem a mesma linha.
-- SECURITY DEFINER + EXECUTE revogado de public/anon/authenticated = least privilege.

-- Claima o job pendente mais antigo, move pending -> claimed e o retorna (ou nenhuma linha).
create or replace function public.claim_agent_job(worker text)
returns public.agent_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.agent_jobs;
begin
  update public.agent_jobs j
     set status     = 'claimed',
         claimed_by = worker,
         claimed_at = now(),
         attempts   = j.attempts + 1
   where j.id = (
     select c.id
       from public.agent_jobs c
      where c.status = 'pending'
      order by c.created_at
      for update skip locked
      limit 1
   )
  returning j.* into claimed;

  return claimed;  -- NULL quando não há job pendente
end;
$$;

-- Claima um watch ativo (não done/failed), marca o tick e o retorna (ou nenhuma linha).
create or replace function public.claim_autonomous_watch(worker text)
returns public.autonomous_watches
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.autonomous_watches;
begin
  update public.autonomous_watches w
     set locked_by      = worker,
         last_ticked_at = now()
   where w.id = (
     select c.id
       from public.autonomous_watches c
      where c.phase in ('watching', 'reviewing', 'notifying')
      order by c.updated_at
      for update skip locked
      limit 1
   )
  returning w.* into claimed;

  return claimed;  -- NULL quando não há watch ativo
end;
$$;

-- Least privilege: ninguém além do service_role executa as RPCs.
revoke execute on function public.claim_agent_job(text) from public, anon, authenticated;
revoke execute on function public.claim_autonomous_watch(text) from public, anon, authenticated;
grant execute on function public.claim_agent_job(text) to service_role;
grant execute on function public.claim_autonomous_watch(text) to service_role;
