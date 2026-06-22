// Entrypoint do Worker (fetch handler). Glue fino: roteia, deriva contexto da borda (IP/país),
// e delega para a lógica pura (origin/event/handleEvent). Ordem: origem -> rate limit -> validação
// -> lógica (SPEC §11). Fan-out/D1 vão para ctx.waitUntil (resposta de beacon rápida).

import type { ExecutionContext } from '@cloudflare/workers-types';
import type { Env } from './env.ts';
import { corsHeaders, isAllowedOrigin } from '../domain/origin.ts';
import { parseEvent } from '../domain/event.ts';
import { evaluateRate, type RateWindow } from '../domain/ratelimit.ts';
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  presenceFlags,
} from '../domain/pii.ts';
import type { TrackingEvent } from '../domain/event.ts';
import { handleEvent } from '../application/handle-event.ts';
import type { HashedUserData } from '../application/fanout.ts';
import { sha256Hex } from './crypto.ts';
import { upsertLpEvent } from './supabase.ts';
import { storeEvent } from './d1.ts';
import { dispatchFanout } from './dispatch.ts';

function json(
  status: number,
  body: Record<string, unknown>,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

async function checkRate(
  env: Env,
  ip: string,
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const max = Number(env.RATE_LIMIT_MAX ?? '60');
  const windowMs = Number(env.RATE_LIMIT_WINDOW_MS ?? '60000');
  const key = `rl:${ip}`;
  const raw = await env.RATE_LIMIT.get(key);
  let prev: RateWindow | null = null;
  if (raw !== null) {
    try {
      prev = JSON.parse(raw) as RateWindow;
    } catch {
      prev = null;
    }
  }
  const res = evaluateRate(prev, Date.now(), windowMs, max);
  if (res.allowed) {
    await env.RATE_LIMIT.put(key, JSON.stringify(res.next), {
      expirationTtl: Math.max(60, Math.ceil(windowMs / 1000)),
    });
  }
  return { allowed: res.allowed, retryAfterSec: res.retryAfterSec };
}

async function hashUserData(ev: TrackingEvent): Promise<HashedUserData> {
  const em =
    isValidEmail(ev.email) && ev.email !== null ? await sha256Hex(normalizeEmail(ev.email)) : null;
  const ph =
    isValidPhone(ev.phone) && ev.phone !== null ? await sha256Hex(normalizePhone(ev.phone)) : null;
  return { em, ph };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = isAllowedOrigin(origin, env.ALLOWED_ORIGIN_SUFFIX);

    // Preflight CORS.
    if (request.method === 'OPTIONS') {
      if (!allowed || origin === null) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    if (request.method !== 'POST' || url.pathname !== '/e') {
      return json(404, { ok: false, error: 'not_found' });
    }

    // authz de borda: origem deny-by-default.
    if (!allowed || origin === null) {
      return json(403, { ok: false, error: 'origin_not_allowed' });
    }
    const cors = corsHeaders(origin);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(400, { ok: false, error: 'invalid_json' }, cors);
    }

    const parsed = parseEvent(body);
    if (!parsed.ok) return json(400, { ok: false, error: parsed.error }, cors);
    const ev = parsed.value;

    const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
    const country = request.headers.get('CF-IPCountry');
    const userAgent = request.headers.get('User-Agent');

    const result = await handleEvent(
      ev,
      { ip, country },
      {
        checkRate: (ipKey) => checkRate(env, ipKey),
        flags: (e) => presenceFlags(e.email, e.phone),
        persistMirror: (row) => upsertLpEvent(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, row),
        backgroundEffects: async (e) => {
          const hashes = await hashUserData(e);
          const nowSec = Math.floor(Date.now() / 1000);
          await Promise.allSettled([
            storeEvent(env.TRACK_DB, e, hashes, country),
            dispatchFanout(env, e, hashes, { ip, userAgent }, nowSec),
          ]);
        },
        log: (event, detail) => console.log(JSON.stringify({ event, ...detail })),
      },
    );

    for (const p of result.background) ctx.waitUntil(p);

    const headers: Record<string, string> = { ...cors };
    if (result.retryAfterSec !== undefined) headers['Retry-After'] = String(result.retryAfterSec);
    return json(result.status, result.body, headers);
  },
};
