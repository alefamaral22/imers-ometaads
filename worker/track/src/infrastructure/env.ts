// Bindings/segredos do Worker (Cloudflare). Não-secretos vêm de [vars] no wrangler.toml; segredos
// via `wrangler secret put` (SPEC §7 / ADR 0021). Canais de fan-out são opcionais: sem credencial,
// o canal fica desligado.

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  // Config
  ALLOWED_ORIGIN_SUFFIX: string;
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW_MS?: string;

  // Supabase (espelho NO-PII)
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string; // secret

  // Bindings
  RATE_LIMIT: KVNamespace;
  TRACK_DB: D1Database;

  // Meta CAPI (opcional)
  META_PIXEL_ID?: string;
  META_CAPI_TOKEN?: string; // secret

  // GA4 Measurement Protocol (opcional)
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string; // secret
}
