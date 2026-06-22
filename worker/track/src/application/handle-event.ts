// Orquestração de um evento de /e — pura (efeitos injetados como ports, testável com fakes).
// Ordem: rate limit -> flags de presença -> espelho NO-PII (awaited, idempotente) -> efeitos de
// background (D1 + fan-out) fail-safe. Beacon: nunca derruba a resposta por falha de efeito.

import type { LpEventRow } from '../domain/lp-event-row.ts';
import { buildLpEventRow } from '../domain/lp-event-row.ts';
import type { TrackingEvent } from '../domain/event.ts';

export interface RequestMeta {
  ip: string;
  country: string | null;
}

export interface HandleResult {
  status: number;
  body: Record<string, unknown>;
  retryAfterSec?: number; // presente só no 429
  background: Array<Promise<unknown>>; // o caller passa a ctx.waitUntil
}

export interface HandleDeps {
  checkRate: (ip: string) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  flags: (ev: TrackingEvent) => { hasEmail: boolean; hasPhone: boolean };
  persistMirror: (row: LpEventRow) => Promise<void>;
  backgroundEffects: (ev: TrackingEvent) => Promise<void>;
  log: (event: string, detail?: Record<string, unknown>) => void;
}

export async function handleEvent(
  ev: TrackingEvent,
  meta: RequestMeta,
  deps: HandleDeps,
): Promise<HandleResult> {
  const rate = await deps.checkRate(meta.ip);
  if (!rate.allowed) {
    return {
      status: 429,
      body: { ok: false, error: 'rate_limited' },
      retryAfterSec: rate.retryAfterSec,
      background: [],
    };
  }

  const { hasEmail, hasPhone } = deps.flags(ev);
  const row = buildLpEventRow(ev, { country: meta.country, hasEmail, hasPhone });

  // Espelho NO-PII é o registro importante: awaited e idempotente. Falha não derruba o beacon.
  try {
    await deps.persistMirror(row);
  } catch (err) {
    deps.log('mirror_failed', { error: String(err) });
  }

  const background = [
    deps.backgroundEffects(ev).catch((err: unknown) => {
      deps.log('effects_failed', { error: String(err) });
    }),
  ];

  return { status: 202, body: { ok: true }, background };
}
