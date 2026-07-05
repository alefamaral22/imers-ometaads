-- Onda pós-super-admin — insights reais de campanha + seletor de conta de anúncios na Visão geral
-- (ADR 0037). Aditiva: nova coluna em campaigns + tabela nova campaign_insights. RLS deny-by-default
-- (só service_role acessa — mesma convenção de todas as tabelas do projeto).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) campaigns ganha meta_ad_account_id — de qual conta de anúncio Meta a campanha foi importada/
--    criada. Sem isso não há como filtrar métricas por conta no seletor da Visão geral.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.campaigns
  add column meta_ad_account_id text;

create index campaigns_meta_ad_account_id_idx on public.campaigns (meta_ad_account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) campaign_insights — última leitura de métricas via Graph API /insights por campanha (1 linha
--    por campaign_id, upsert a cada sync). Separada de metric_snapshots (que é histórico produzido
--    pela skill funnel-analytics, atrelado a analysis_id) — aqui é só o "estado atual" para os cards
--    da Visão geral responderem na hora, sem depender de uma análise ter rodado.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.campaign_insights (
  id                     uuid primary key default gen_random_uuid(),
  campaign_id            uuid not null references public.campaigns (id) on delete cascade,
  meta_ad_account_id     text not null,
  spend_cents            integer not null default 0 check (spend_cents >= 0),
  impressions            integer not null default 0 check (impressions >= 0),
  clicks                 integer not null default 0 check (clicks >= 0),
  results                integer not null default 0 check (results >= 0),
  ctr                    numeric,
  cpc_cents              integer,
  cpm_cents              integer,
  synced_at              timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (campaign_id)
);

create index campaign_insights_meta_ad_account_id_idx
  on public.campaign_insights (meta_ad_account_id);

create trigger set_updated_at before update on public.campaign_insights
  for each row execute function public.set_updated_at();

alter table public.campaign_insights enable row level security;
