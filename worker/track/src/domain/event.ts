// Parse + validação do payload de /e — pura, hand-rolled (sem deps), conteúdo é DADO, não
// instrução (SPEC §11). Required inválido => rejeita; opcional inválido => null (não derruba o
// evento). Campos de PII (email/phone) são mantidos só para hashing posterior — nunca persistidos
// crus. `country`/IP NÃO vêm daqui (são derivados na borda).

export const EVENT_TYPES = [
  'pageview',
  'view_content',
  'add_to_cart',
  'initiate_checkout',
  'lead',
  'purchase',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface Utm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
}

export interface TrackingEvent {
  eventId: string;
  eventType: EventType;
  landingPageId: string | null;
  utm: Utm;
  value: number | null;
  currency: string | null;
  eventSourceUrl: string | null;
  gaClientId: string | null;
  fbp: string | null;
  fbc: string | null;
  gclid: string | null;
  email: string | null; // PII — só p/ hash; nunca persistido cru
  phone: string | null; // PII — idem
  ts: number | null; // epoch ms (cliente, advisory)
}

export type ParseResult = { ok: true; value: TrackingEvent } | { ok: false; error: string };

const EVENT_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

const EVENT_TYPE_SET = new Set<string>(EVENT_TYPES);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Remove caracteres de controle (codepoint < 0x20 ou DEL 0x7F) de strings não confiáveis,
// por codepoint — evita um regex de control-char (e o lint no-control-regex).
function stripControl(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  return out;
}

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const cleaned = stripControl(v).trim();
  return cleaned === '' ? null : cleaned;
}

function capped(v: string | null, max: number): string | null {
  if (v === null) return null;
  return v.length > max ? v.slice(0, max) : v;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asHttpUrl(v: unknown): string | null {
  const s = capped(asString(v), 2048);
  if (s === null) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? s : null;
  } catch {
    return null;
  }
}

function readUtm(body: Record<string, unknown>): Utm {
  const nested = isRecord(body.utm) ? body.utm : {};
  const pick = (k: keyof Utm): string | null =>
    capped(asString(nested[k] ?? body[`utm_${k}`]), 200);
  return {
    source: pick('source'),
    medium: pick('medium'),
    campaign: pick('campaign'),
    term: pick('term'),
    content: pick('content'),
  };
}

/** Valida o corpo do POST /e. Sucesso => TrackingEvent normalizado. */
export function parseEvent(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, error: 'body must be a JSON object' };

  const eventId = asString(body.event_id);
  if (eventId === null || !EVENT_ID_RE.test(eventId)) {
    return { ok: false, error: 'invalid event_id' };
  }

  const eventTypeRaw = asString(body.event_type);
  if (eventTypeRaw === null || !EVENT_TYPE_SET.has(eventTypeRaw)) {
    return { ok: false, error: 'invalid event_type' };
  }
  const eventType = eventTypeRaw as EventType;

  const lpRaw = asString(body.landing_page_id);
  const landingPageId = lpRaw !== null && UUID_RE.test(lpRaw) ? lpRaw : null;

  const curRaw = asString(body.currency);
  const curUpper = curRaw === null ? null : curRaw.toUpperCase();
  const currency = curUpper !== null && CURRENCY_RE.test(curUpper) ? curUpper : null;

  const valRaw = asNumber(body.value);
  const value = valRaw !== null && valRaw >= 0 ? valRaw : null;

  const user = isRecord(body.user) ? body.user : {};

  return {
    ok: true,
    value: {
      eventId,
      eventType,
      landingPageId,
      utm: readUtm(body),
      value,
      currency,
      eventSourceUrl: asHttpUrl(body.event_source_url),
      gaClientId: capped(asString(body.ga_client_id), 256),
      fbp: capped(asString(body.fbp), 256),
      fbc: capped(asString(body.fbc), 512),
      gclid: capped(asString(body.gclid), 512),
      email: capped(asString(user.email), 320),
      phone: capped(asString(user.phone), 40),
      ts: asNumber(body.ts),
    },
  };
}

const META_EVENT_NAME: Record<EventType, string> = {
  pageview: 'PageView',
  view_content: 'ViewContent',
  add_to_cart: 'AddToCart',
  initiate_checkout: 'InitiateCheckout',
  lead: 'Lead',
  purchase: 'Purchase',
};

const GA4_EVENT_NAME: Record<EventType, string> = {
  pageview: 'page_view',
  view_content: 'view_item',
  add_to_cart: 'add_to_cart',
  initiate_checkout: 'begin_checkout',
  lead: 'generate_lead',
  purchase: 'purchase',
};

export function metaEventName(t: EventType): string {
  return META_EVENT_NAME[t];
}

export function ga4EventName(t: EventType): string {
  return GA4_EVENT_NAME[t];
}
