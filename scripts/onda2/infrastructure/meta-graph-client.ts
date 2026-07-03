// ADR 0035 — Cliente REST da Meta Graph/Marketing API com token do tenant. Substitui o MCP
// compartilhado na escrita de campanha. O token decifrado só existe em memória, no instante da
// chamada (nunca em log, nunca em env). I/O isolado em infrastructure/; payloads vêm do domain/.

import type {
  AdPayload,
  AdSetPayload,
  CampaignPayload,
  CreativePayload,
} from '../domain/meta-payload.ts';

export const META_GRAPH_API_VERSION = 'v21.0' as const;

export interface MetaGraphConfig {
  adAccountId: string; // ex.: act_123456789
  token: string; // System User token decifrado — só em memória, no instante da chamada
}

type FetchLike = typeof fetch;

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

function baseUrl(): string {
  return `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
}

async function post(
  cfg: MetaGraphConfig,
  path: string,
  body: Record<string, unknown>,
  fetchImpl: FetchLike,
): Promise<{ id: string }> {
  const res = await fetchImpl(`${baseUrl()}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Nunca logar cfg.token — a mensagem de erro da Meta não o inclui, mas o caller não deve anexá-lo.
    const detail = await res.text().catch(() => '');
    throw new MetaGraphError(
      path,
      res.status,
      `Meta Graph API ${res.status} on ${path}: ${detail.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new MetaGraphError(path, res.status, `Meta Graph API ${path} returned no id`);
  return { id: json.id };
}

export async function createCampaign(
  cfg: MetaGraphConfig,
  payload: CampaignPayload,
  fetchImpl: FetchLike = fetch,
): Promise<{ id: string }> {
  return post(cfg, `${cfg.adAccountId}/campaigns`, { ...payload }, fetchImpl);
}

export async function createAdSet(
  cfg: MetaGraphConfig,
  campaignId: string,
  payload: AdSetPayload,
  fetchImpl: FetchLike = fetch,
): Promise<{ id: string }> {
  return post(cfg, `${cfg.adAccountId}/adsets`, { ...payload, campaign_id: campaignId }, fetchImpl);
}

export async function createCreative(
  cfg: MetaGraphConfig,
  payload: CreativePayload,
  fetchImpl: FetchLike = fetch,
): Promise<{ id: string }> {
  return post(cfg, `${cfg.adAccountId}/adcreatives`, { ...payload }, fetchImpl);
}

export async function createAd(
  cfg: MetaGraphConfig,
  adSetId: string,
  creativeId: string,
  payload: AdPayload,
  fetchImpl: FetchLike = fetch,
): Promise<{ id: string }> {
  return post(
    cfg,
    `${cfg.adAccountId}/ads`,
    { ...payload, adset_id: adSetId, creative: { creative_id: creativeId } },
    fetchImpl,
  );
}
