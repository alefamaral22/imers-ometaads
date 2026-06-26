-- SPEC-017 — métricas de conversa do WhatsApp em metric_snapshots.
-- Aditivo e nullable: snapshots de tráfego seguem com conversations/replies = null (não-WhatsApp).
-- "Msgs/conversa" e "custo/conversa" são DERIVADOS na leitura (replies/conversations, spend/conversations),
-- então não viram coluna. bigint segue o padrão das outras contagens da tabela.

alter table public.metric_snapshots
  add column if not exists conversations bigint,  -- conversas de mensagem iniciadas (atribuição da skill)
  add column if not exists replies bigint;        -- respostas dentro das conversas
