// Disparo do fan-out — best-effort. Constrói os descritores puros (application/fanout) a partir
// das credenciais disponíveis no Env e dispara com Promise.allSettled (um canal que falha não
// afeta os outros nem a resposta). Destinos são fixos no builder (anti-SSRF).

import type { Env } from './env.ts';
import type { TrackingEvent } from '../domain/event.ts';
import type {
  ClientContext,
  Ga4Config,
  HashedUserData,
  MetaCapiConfig,
} from '../application/fanout.ts';
import { buildFanout } from '../application/fanout.ts';

function capiConfig(env: Env): MetaCapiConfig | null {
  return env.META_PIXEL_ID && env.META_CAPI_TOKEN
    ? { pixelId: env.META_PIXEL_ID, token: env.META_CAPI_TOKEN }
    : null;
}

function ga4Config(env: Env): Ga4Config | null {
  return env.GA4_MEASUREMENT_ID && env.GA4_API_SECRET
    ? { measurementId: env.GA4_MEASUREMENT_ID, apiSecret: env.GA4_API_SECRET }
    : null;
}

export async function dispatchFanout(
  env: Env,
  ev: TrackingEvent,
  hashes: HashedUserData,
  client: ClientContext,
  nowSec: number,
): Promise<void> {
  const ga4ClientId = ev.gaClientId ?? ev.eventId;
  const descriptors = buildFanout(
    capiConfig(env),
    ga4Config(env),
    ev,
    hashes,
    client,
    ga4ClientId,
    nowSec,
  );
  if (descriptors.length === 0) return;
  await Promise.allSettled(
    descriptors.map((d) => fetch(d.url, { method: d.method, headers: d.headers, body: d.body })),
  );
}
