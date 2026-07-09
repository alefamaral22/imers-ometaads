import 'server-only';
import { z } from 'zod';

export const META_GRAPH_API_VERSION = 'v21.0' as const;

export class MetaGraphError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'MetaGraphError';
  }
}

const metaCampaignApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  status: z.string(),
  daily_budget: z.string().optional(),
  lifetime_budget: z.string().optional(),
});
export type MetaCampaignApi = z.infer<typeof metaCampaignApiSchema>;

// Payload de /insights é dado de fronteira (a Meta manda strings numéricas e listas heterogêneas de
// ações) — validado item a item antes de qualquer cálculo. `actions` cobre "results": somamos as
// ações que representam conversão (não impressão/click, que já vêm em campos próprios).
const metaActionApiSchema = z.object({
  action_type: z.string(),
  value: z.string(),
});
const metaInsightApiSchema = z.object({
  campaign_id: z.string(),
  spend: z.string().optional(),
  impressions: z.string().optional(),
  clicks: z.string().optional(),
  ctr: z.string().optional(),
  cpc: z.string().optional(),
  cpm: z.string().optional(),
  actions: z.array(metaActionApiSchema).optional(),
});
export type MetaInsightApi = z.infer<typeof metaInsightApiSchema>;

// Tipos de ação que contam como "conversa iniciada" em campanhas de WhatsApp
const WHATSAPP_CONVERSATION_ACTIONS = new Set([
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'messaging_conversation_started_7d',
]);

// Tipos de ação que contam como "respostas" em campanhas de WhatsApp
const WHATSAPP_REPLY_ACTIONS = new Set([
  'onsite_conversion.messaging_first_reply',
  'messaging_first_reply',
]);

// Result = soma das ações de conversão (exclui impression/link_click, que já são colunas próprias).
const NON_RESULT_ACTION_TYPES = new Set(['impression', 'link_click', 'post_engagement']);

export interface CampaignInsight {
  campaignId: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  results: number;
  ctr: number | null;
  cpcCents: number | null;
  cpmCents: number | null;
  // WhatsApp metrics
  conversations: number;
  replies: number;
}

function centsFromDecimalString(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toCampaignInsight(raw: MetaInsightApi): CampaignInsight {
  const results = (raw.actions ?? [])
    .filter((a) => !NON_RESULT_ACTION_TYPES.has(a.action_type))
    .reduce((sum, a) => sum + (Number(a.value) || 0), 0);

  // WhatsApp: contar conversas iniciadas e respostas
  const conversations = (raw.actions ?? [])
    .filter((a) => WHATSAPP_CONVERSATION_ACTIONS.has(a.action_type))
    .reduce((sum, a) => sum + (Number(a.value) || 0), 0);
  const replies = (raw.actions ?? [])
    .filter((a) => WHATSAPP_REPLY_ACTIONS.has(a.action_type))
    .reduce((sum, a) => sum + (Number(a.value) || 0), 0);

  return {
    campaignId: raw.campaign_id,
    spendCents: centsFromDecimalString(raw.spend),
    impressions: raw.impressions ? Math.round(Number(raw.impressions)) || 0 : 0,
    clicks: raw.clicks ? Math.round(Number(raw.clicks)) || 0 : 0,
    results: Math.round(results),
    ctr: raw.ctr ? Number(raw.ctr) : null,
    cpcCents: raw.cpc ? centsFromDecimalString(raw.cpc) : null,
    cpmCents: raw.cpm ? centsFromDecimalString(raw.cpm) : null,
    conversations: Math.round(conversations),
    replies: Math.round(replies),
  };
}

type FetchLike = typeof fetch;

function baseUrl(): string {
  return `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
}

/**
 * Lê campanhas de uma conta de anúncio (read-only). Payload da Meta é dado de fronteira — cada
 * item é validado por schema antes de voltar ao chamador. Pagina até um teto (evita função presa).
 */
export async function listCampaigns(
  adAccountId: string,
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<MetaCampaignApi[]> {
  const fields = 'id,name,objective,status,daily_budget,lifetime_budget';
  const results: MetaCampaignApi[] = [];
  let url: string | undefined = `${baseUrl()}/${adAccountId}/campaigns?fields=${fields}&limit=100`;
  let pages = 0;
  while (url && pages < 5) {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new MetaGraphError(
        'campaigns',
        res.status,
        `Meta Graph API ${res.status} on campaigns: ${detail.slice(0, 500)}`,
      );
    }
    const json = (await res.json()) as { data?: unknown[]; paging?: { next?: string } };
    for (const raw of json.data ?? []) {
      results.push(metaCampaignApiSchema.parse(raw));
    }
    url = json.paging?.next;
    pages++;
  }
  return results;
}

/**
 * Lê insights (spend/impressions/clicks/results) por campanha de uma conta de anúncio (read-only).
 * date_preset=maximum cobre a vida da campanha — o objetivo aqui é "estado atual" para os cards da
 * Visão geral, não uma série histórica (isso já existe em metric_snapshots via funnel-analytics).
 */
// Schema para contas de anúncio retornadas por /me/adaccounts
const metaAdAccountApiSchema = z.object({
  id: z.string(), // formato "act_123456789"
  name: z.string(),
  account_status: z.number().optional(),
  currency: z.string().optional(),
  business_name: z.string().optional(),
});
export type MetaAdAccountApi = z.infer<typeof metaAdAccountApiSchema>;

const metaAdAccountCurrencyApiSchema = z.object({
  currency: z.string().optional(),
});

/** Lê a moeda da conta de anúncio (ex.: BRL, USD) para conversão de métricas. */
export async function getAdAccountCurrency(
  adAccountId: string,
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const url = `${baseUrl()}/${adAccountId}?fields=currency`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new MetaGraphError(
      'adaccount_currency',
      res.status,
      `Meta Graph API ${res.status} on adaccount_currency: ${detail.slice(0, 500)}`,
    );
  }
  const json = await res.json();
  return metaAdAccountCurrencyApiSchema.parse(json).currency ?? 'BRL';
}

/**
 * Lista todas as contas de anúncio acessíveis pelo token (GET /me/adaccounts).
 * Útil para o fluxo de conexão: o usuário cola o token, clica em "Carregar" e escolhe qual conta importar.
 */
export async function listAdAccountsFromToken(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<MetaAdAccountApi[]> {
  const fields = 'id,name,account_status,currency,business_name';
  const results: MetaAdAccountApi[] = [];
  let url: string | undefined = `${baseUrl()}/me/adaccounts?fields=${fields}&limit=100`;
  let pages = 0;
  while (url && pages < 5) {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new MetaGraphError(
        'adaccounts',
        res.status,
        `Meta Graph API ${res.status} on adaccounts: ${detail.slice(0, 500)}`,
      );
    }
    const json = (await res.json()) as { data?: unknown[]; paging?: { next?: string } };
    for (const raw of json.data ?? []) {
      results.push(metaAdAccountApiSchema.parse(raw));
    }
    url = json.paging?.next;
    pages++;
  }
  return results;
}

export async function listCampaignInsights(
  adAccountId: string,
  token: string,
  fetchImpl: FetchLike = fetch,
  dateRange?: { since: string; until: string },
): Promise<CampaignInsight[]> {
  const fields = 'campaign_id,spend,impressions,clicks,ctr,cpc,cpm,actions';
  const results: CampaignInsight[] = [];
  // Se houver dateRange, usa time_range (formato JSON codificado); senão date_preset=maximum (vida toda).
  const timeParam = dateRange
    ? `time_range=${encodeURIComponent(JSON.stringify(dateRange))}`
    : `date_preset=maximum`;
  let url: string | undefined =
    `${baseUrl()}/${adAccountId}/insights` +
    `?level=campaign&${timeParam}&fields=${fields}&limit=100`;
  let pages = 0;
  while (url && pages < 5) {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new MetaGraphError(
        'insights',
        res.status,
        `Meta Graph API ${res.status} on insights: ${detail.slice(0, 500)}`,
      );
    }
    const json = (await res.json()) as { data?: unknown[]; paging?: { next?: string } };
    for (const raw of json.data ?? []) {
      results.push(toCampaignInsight(metaInsightApiSchema.parse(raw)));
    }
    url = json.paging?.next;
    pages++;
  }
  return results;
}
