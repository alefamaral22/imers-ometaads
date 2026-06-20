-- Onda 1 — RLS deny-by-default em TODAS as tabelas (SPEC-000 §6/§11).
-- Why: sem policies criadas, anon/authenticated não acessam nada; só o service_role (BYPASSRLS)
-- lê/escreve. Toda leitura é server-side. Adicionar tabela nova => adicionar ENABLE aqui.

alter table public.clients               enable row level security;
alter table public.campaigns             enable row level security;
alter table public.ad_sets               enable row level security;
alter table public.ads                   enable row level security;
alter table public.generated_images      enable row level security;
alter table public.creatives             enable row level security;
alter table public.analyses              enable row level security;
alter table public.metric_snapshots      enable row level security;
alter table public.analysis_findings     enable row level security;
alter table public.funnel_events         enable row level security;
alter table public.products              enable row level security;
alter table public.landing_pages         enable row level security;
alter table public.landing_page_sections enable row level security;
alter table public.agent_jobs            enable row level security;
alter table public.autonomous_watches    enable row level security;
alter table public.nexus_narrations      enable row level security;
alter table public.operation_logs        enable row level security;
alter table public.agent_events          enable row level security;
alter table public.daily_summaries       enable row level security;
alter table public.lp_events             enable row level security;
