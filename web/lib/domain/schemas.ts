import { z } from 'zod';

/**
 * Row schemas (domain). These mirror the EXACT column names of the Supabase migrations
 * (supabase/migrations/*). PostgREST output is external input, so every read is parsed through
 * these schemas before reaching a page — a schema drift surfaces as a clear error, not a silent
 * wrong render. Unknown columns are stripped (default Zod object behavior) so `select=*` is fine.
 */

const ts = z.string(); // timestamptz comes back as ISO string from PostgREST

// public.clients
export const clientRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  ad_account_id: z.string().nullable(),
  business_manager_id: z.string().nullable(),
  facebook_page_id: z.string().nullable(),
  default_landing_url: z.string().nullable(),
  daily_budget_cap_cents: z.number(),
  currency: z.string(),
  materials_path: z.string().nullable(),
  created_at: ts,
  updated_at: ts,
});
export type ClientRow = z.infer<typeof clientRowSchema>;

// ── Onda 12 — multi-tenant ─────────────────────────────────────────────────────
// public.accounts
export const accountRole = z.enum(['super_admin', 'socio', 'cliente_usuario']);
export const accountRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  role: accountRole,
  plan: z.string(),
  subscription_status: z.string(),
  is_active: z.boolean(),
  email: z.string().nullable(), // identificador de login (não-segredo); null até ter senha própria
  last_login_at: ts.nullable(),
  created_at: ts,
  updated_at: ts,
});
export type AccountRow = z.infer<typeof accountRowSchema>;

// Projeção de DISPLAY das accounts: NUNCA inclui password_hash → o hash nunca sai do servidor.
export const ACCOUNT_DISPLAY_COLUMNS =
  'id,slug,name,role,plan,subscription_status,is_active,email,last_login_at,created_at,updated_at';

// public.ad_account_connections — projeção de DISPLAY: NUNCA inclui access_token_cipher.
export const connectionStatus = z.enum(['unverified', 'active', 'invalid', 'revoked']);
export const connectionDisplaySchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  client_id: z.string().uuid().nullable(),
  meta_ad_account_id: z.string(),
  connection_method: z.enum(['manual_token', 'oauth_meta']),
  status: connectionStatus,
  access_token_last4: z.string().nullable(),
  token_label: z.string().nullable(),
  last_validated_at: ts.nullable(),
  last_validation_error: z.string().nullable(),
  connected_at: ts,
  created_at: ts,
  updated_at: ts,
});
export type ConnectionDisplay = z.infer<typeof connectionDisplaySchema>;

// public.api_keys_clientes — projeção de DISPLAY: NUNCA inclui key_cipher.
export const apiKeyDisplaySchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  provider: z.enum(['anthropic', 'openai', 'elevenlabs', 'minimax', 'other']),
  label: z.string().nullable(),
  key_last4: z.string().nullable(),
  status: z.enum(['unverified', 'active', 'invalid']),
  last_validated_at: ts.nullable(),
  created_at: ts,
  updated_at: ts,
});
export type ApiKeyDisplay = z.infer<typeof apiKeyDisplaySchema>;

// Colunas de DISPLAY (sem segredo) que os serviços projetam no select. Manter em sincronia com os
// schemas acima — o cipher NUNCA entra aqui, logo nunca sai do servidor.
export const CONNECTION_DISPLAY_COLUMNS =
  'id,account_id,client_id,meta_ad_account_id,connection_method,status,access_token_last4,token_label,last_validated_at,last_validation_error,connected_at,created_at,updated_at';
export const API_KEY_DISPLAY_COLUMNS =
  'id,account_id,provider,label,key_last4,status,last_validated_at,created_at,updated_at';

// public.campaigns
export const entityStatus = z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED']);
export const campaignRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  meta_campaign_id: z.string().nullable(),
  name: z.string(),
  objective: z.string(),
  budget_mode: z.enum(['CBO', 'ABO']).nullable(),
  daily_budget_cents: z.number().nullable(),
  status: entityStatus,
  special_ad_categories: z.array(z.string()),
  created_at: ts,
  updated_at: ts,
});
export type CampaignRow = z.infer<typeof campaignRowSchema>;

// public.analyses
export const analysisVerdict = z.enum([
  'healthy',
  'watch',
  'underperforming',
  'learning',
  'no_data',
  'error',
]);
export const analysisRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  objective: z.string().nullable(),
  window_start: ts.nullable(),
  window_stop: ts.nullable(),
  compare_window: z.string().nullable(),
  entities_analyzed: z.number().nullable(),
  overall_verdict: analysisVerdict,
  summary: z.string().nullable(),
  triggered_by: z.string().nullable(),
  created_at: ts,
});
export type AnalysisRow = z.infer<typeof analysisRowSchema>;

// public.live_snapshots (Onda 16) — raio-x ao vivo (1 linha por job). payload é jsonb produzido pela
// skill (métricas compactas + alertas); validado de forma frouxa aqui (dado de fronteira, consumido
// como JSON pelo Nexus). Sem PII por contrato.
export const liveSnapshotRowSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  client_id: z.string().uuid(),
  job_id: z.string().uuid(),
  period: z.string(),
  payload: z.unknown(),
  created_at: ts,
});
export type LiveSnapshotRow = z.infer<typeof liveSnapshotRowSchema>;

// public.funnel_events
export const funnelLevel = z.enum(['account', 'campaign', 'ad_set', 'ad']);
export const funnelEventType = z.enum([
  'impression',
  'link_click',
  'landing_page_view',
  'view_content',
  'add_to_cart',
  'initiate_checkout',
  'purchase',
]);
export const funnelEventRowSchema = z.object({
  id: z.string().uuid(),
  analysis_id: z.string().uuid(),
  level: funnelLevel,
  meta_entity_id: z.string().nullable(),
  step_order: z.number(),
  event_type: funnelEventType,
  count: z.number().nullable(),
  value_cents: z.number().nullable(),
  cost_per_event_cents: z.number().nullable(),
  cvr_from_prev: z.number().nullable(),
  cvr_from_top: z.number().nullable(),
  created_at: ts,
});
export type FunnelEventRow = z.infer<typeof funnelEventRowSchema>;

// public.metric_snapshots — métricas por entidade/análise (produzidas pela skill funnel-analytics).
// Numéricos vêm como number|null do PostgREST; bigint vira number (valores cabem em double com folga).
export const metricSnapshotRowSchema = z.object({
  id: z.string().uuid(),
  analysis_id: z.string().uuid(),
  level: funnelLevel,
  meta_entity_id: z.string().nullable(),
  impressions: z.number().nullable(),
  spend_cents: z.number().nullable(),
  ctr: z.number().nullable(),
  cpc_cents: z.number().nullable(),
  cpm_cents: z.number().nullable(),
  landing_page_views: z.number().nullable(),
  cplpv_cents: z.number().nullable(),
  results: z.number().nullable(),
  cost_per_result_cents: z.number().nullable(),
  conversations: z.number().nullable(), // WhatsApp/messaging: null distingue não-messaging de zero conversas
  replies: z.number().nullable(),
  created_at: ts,
});
export type MetricSnapshotRow = z.infer<typeof metricSnapshotRowSchema>;

// public.landing_pages
export const lpStatus = z.enum(['draft', 'building', 'deployed', 'failed']);
export const lpDraftStatus = z.enum(['empty', 'generating', 'ready', 'editing', 'publishing']);
export const landingPageRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  product_id: z.string().uuid().nullable(),
  subdomain: z.string(),
  fqdn: z.string().nullable(),
  url: z.string().nullable(),
  price_cents: z.number().nullable(),
  cart_state: z.enum(['open', 'closed']),
  noindex: z.boolean(),
  status: lpStatus,
  draft_status: lpDraftStatus,
  created_at: ts,
  updated_at: ts,
});
export type LandingPageRow = z.infer<typeof landingPageRowSchema>;

// public.landing_page_sections
export const landingPageSectionRowSchema = z.object({
  id: z.string().uuid(),
  landing_page_id: z.string().uuid(),
  type: z.string(),
  position: z.number(),
  enabled: z.boolean(),
  fields: z.record(z.string(), z.unknown()).nullable(),
  version: z.number(),
  created_at: ts,
  updated_at: ts,
});
export type LandingPageSectionRow = z.infer<typeof landingPageSectionRowSchema>;

// public.operation_logs
export const operationAction = z.enum(['create', 'update', 'delete', 'activate', 'pause']);
export const operationLogRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid().nullable(),
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  action: operationAction,
  actor: z.string().nullable(),
  summary: z.string().nullable(),
  created_at: ts,
});
export type OperationLogRow = z.infer<typeof operationLogRowSchema>;

// public.daily_summaries
export const dailySummaryRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  summary_date: z.string(),
  summary: z.string().nullable(),
  created_at: ts,
  updated_at: ts,
});
export type DailySummaryRow = z.infer<typeof dailySummaryRowSchema>;

// public.nexus_narrations (append-only; falas do Nexus, 1 por tick no modo autônomo — Onda 9)
export const narrationKind = z.enum(['status', 'opinion', 'system']);
export const nexusNarrationRowSchema = z.object({
  id: z.string().uuid(),
  watch_id: z.string().uuid().nullable(),
  session_id: z.string().nullable(),
  text: z.string(),
  kind: narrationKind,
  image_path: z.string().nullable(),
  spoken_at: ts.nullable(),
  created_at: ts,
});
export type NexusNarrationRow = z.infer<typeof nexusNarrationRowSchema>;

/** Parse an array of unknown rows with a row schema; throws on drift. */
export function parseRows<T>(schema: z.ZodType<T>, rows: unknown[]): T[] {
  return rows.map((row) => schema.parse(row));
}
