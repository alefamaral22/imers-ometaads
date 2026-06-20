-- Onda 1 — Helpers e tipos enumerados (SPEC-000 §6).
-- Why: tipos fechados tornam os domínios um contrato verificado pelo banco, e o trigger
-- centraliza a manutenção de updated_at em todas as tabelas mutáveis.

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Mantém updated_at coerente em qualquer tabela mutável que registre este trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Hierarquia / status Meta.
create type public.budget_mode as enum ('CBO', 'ABO');
create type public.entity_status as enum ('ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED');

-- Analytics.
create type public.analysis_verdict as enum (
  'healthy', 'watch', 'underperforming', 'learning', 'no_data', 'error'
);
create type public.metric_level as enum ('campaign', 'ad_set', 'ad');
create type public.funnel_level as enum ('account', 'campaign', 'ad_set', 'ad');
create type public.funnel_event_type as enum (
  'impression', 'link_click', 'landing_page_view',
  'view_content', 'add_to_cart', 'initiate_checkout', 'purchase'
);
create type public.finding_severity as enum ('positive', 'info', 'warning', 'critical');

-- Fila e autônomo.
create type public.job_kind as enum (
  'create', 'create_sales', 'activate', 'analyze',
  'summarize', 'landing', 'landing_publish', 'landing_edit'
);
create type public.job_status as enum (
  'pending', 'claimed', 'running', 'completed', 'failed', 'cancelled'
);
create type public.watch_phase as enum (
  'watching', 'reviewing', 'notifying', 'done', 'failed'
);
create type public.narration_kind as enum ('status', 'opinion', 'system');

-- Auditoria / dashboard.
create type public.operation_action as enum ('create', 'update', 'delete', 'activate', 'pause');
create type public.agent_type as enum ('skill', 'subagent', 'tool', 'system');
create type public.agent_event_type as enum ('start', 'step', 'decision', 'error', 'end');

-- Landing pages.
create type public.cart_state as enum ('open', 'closed');
create type public.lp_status as enum ('draft', 'building', 'deployed', 'failed');
create type public.lp_draft_status as enum (
  'empty', 'generating', 'ready', 'editing', 'publishing'
);
