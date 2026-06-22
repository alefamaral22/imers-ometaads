// Montagem da linha de public.lp_events — pura. ESTA é a fronteira de PII: enumera APENAS as
// colunas NO-PII permitidas (dimensões + flags). Email/telefone/ids de clique do TrackingEvent
// JAMAIS entram aqui. Um teste falha se surgir uma chave de PII (SPEC §11 / threat model).

import type { TrackingEvent } from './event.ts';

export interface LpEventRow {
  event_id: string;
  landing_page_id: string | null;
  event_type: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  country: string | null;
  value: number | null;
  currency: string | null;
  has_email: boolean;
  has_phone: boolean;
}

export interface MirrorContext {
  country: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
}

export function buildLpEventRow(ev: TrackingEvent, ctx: MirrorContext): LpEventRow {
  return {
    event_id: ev.eventId,
    landing_page_id: ev.landingPageId,
    event_type: ev.eventType,
    utm_source: ev.utm.source,
    utm_medium: ev.utm.medium,
    utm_campaign: ev.utm.campaign,
    utm_term: ev.utm.term,
    utm_content: ev.utm.content,
    country: ctx.country,
    value: ev.value,
    currency: ev.currency,
    has_email: ctx.hasEmail,
    has_phone: ctx.hasPhone,
  };
}
