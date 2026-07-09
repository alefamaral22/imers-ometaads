-- Adiciona métricas de WhatsApp à campaign_insights (espelho do que já existe em metric_snapshots).
-- conversations e replies são nullable: campanhas não-WhatsApp ficam com null.
alter table public.campaign_insights
  add column if not exists conversations bigint,
  add column if not exists replies bigint;

comment on column public.campaign_insights.conversations is 'Conversas de mensagem iniciadas (WhatsApp)';
comment on column public.campaign_insights.replies is 'Respostas dentro das conversas (WhatsApp)';
