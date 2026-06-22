// Construção dos descritores de fan-out — pura (sem fetch). A infra dispara os descritores
// best-effort. Destinos são FIXOS (graph.facebook.com / google-analytics.com) — a entrada do
// usuário NUNCA define a URL de saída (anti-SSRF). PII só entra hasheada (em/ph). Google Ads é
// coberto via importação de conversões do GA4 (gclid repassado) — ver ADR 0021.

import type { TrackingEvent } from '../domain/event.ts';
import { ga4EventName, metaEventName } from '../domain/event.ts';

const META_GRAPH_VERSION = 'v21.0';

export interface HttpRequestDescriptor {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface HashedUserData {
  em: string | null; // SHA-256 do email normalizado
  ph: string | null; // SHA-256 do telefone normalizado
}

export interface MetaCapiConfig {
  pixelId: string;
  token: string;
}

export interface Ga4Config {
  measurementId: string;
  apiSecret: string;
}

export interface ClientContext {
  ip: string | null;
  userAgent: string | null;
}

/** Monta o request do Meta Conversions API. cfg null (sem credencial) => null (canal desligado). */
export function buildCapiRequest(
  cfg: MetaCapiConfig | null,
  ev: TrackingEvent,
  hashes: HashedUserData,
  client: ClientContext,
  nowSec: number,
): HttpRequestDescriptor | null {
  if (cfg === null) return null;

  const userData: Record<string, unknown> = {};
  if (hashes.em !== null) userData.em = [hashes.em];
  if (hashes.ph !== null) userData.ph = [hashes.ph];
  if (ev.fbp !== null) userData.fbp = ev.fbp;
  if (ev.fbc !== null) userData.fbc = ev.fbc;
  if (client.ip !== null) userData.client_ip_address = client.ip;
  if (client.userAgent !== null) userData.client_user_agent = client.userAgent;

  const customData: Record<string, unknown> = {};
  if (ev.value !== null) customData.value = ev.value;
  if (ev.currency !== null) customData.currency = ev.currency;

  const eventData: Record<string, unknown> = {
    event_name: metaEventName(ev.eventType),
    event_time: ev.ts !== null ? Math.floor(ev.ts / 1000) : nowSec,
    action_source: 'website',
    event_id: ev.eventId, // dedup com o pixel do browser
    user_data: userData,
  };
  if (ev.eventSourceUrl !== null) eventData.event_source_url = ev.eventSourceUrl;
  if (Object.keys(customData).length > 0) eventData.custom_data = customData;

  return {
    url: `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(
      cfg.pixelId,
    )}/events?access_token=${encodeURIComponent(cfg.token)}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [eventData] }),
  };
}

/** Monta o request do GA4 Measurement Protocol. cfg null => null. clientId = _ga ou fallback. */
export function buildGa4Request(
  cfg: Ga4Config | null,
  ev: TrackingEvent,
  clientId: string,
): HttpRequestDescriptor | null {
  if (cfg === null) return null;

  const params: Record<string, unknown> = {};
  if (ev.value !== null) params.value = ev.value;
  if (ev.currency !== null) params.currency = ev.currency;
  if (ev.gclid !== null) params.gclid = ev.gclid; // importação de conversão p/ Google Ads
  if (ev.utm.source !== null) params.source = ev.utm.source;
  if (ev.utm.medium !== null) params.medium = ev.utm.medium;
  if (ev.utm.campaign !== null) params.campaign = ev.utm.campaign;

  const eventName = ga4EventName(ev.eventType);

  return {
    url: `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
      cfg.measurementId,
    )}&api_secret=${encodeURIComponent(cfg.apiSecret)}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, events: [{ name: eventName, params }] }),
  };
}

/** Agrega os descritores ativos (canais sem credencial são omitidos). */
export function buildFanout(
  capi: MetaCapiConfig | null,
  ga4: Ga4Config | null,
  ev: TrackingEvent,
  hashes: HashedUserData,
  client: ClientContext,
  ga4ClientId: string,
  nowSec: number,
): HttpRequestDescriptor[] {
  const out: HttpRequestDescriptor[] = [];
  const capiReq = buildCapiRequest(capi, ev, hashes, client, nowSec);
  if (capiReq !== null) out.push(capiReq);
  const ga4Req = buildGa4Request(ga4, ev, ga4ClientId);
  if (ga4Req !== null) out.push(ga4Req);
  return out;
}
