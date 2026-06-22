import { describe, expect, it, vi } from 'vitest';
import { handleEvent, type HandleDeps } from './handle-event.ts';
import type { TrackingEvent } from '../domain/event.ts';

const ev: TrackingEvent = {
  eventId: 'evt_abcdef12',
  eventType: 'purchase',
  landingPageId: null,
  utm: { source: 'fb', medium: null, campaign: null, term: null, content: null },
  value: 10,
  currency: 'BRL',
  eventSourceUrl: null,
  gaClientId: null,
  fbp: null,
  fbc: null,
  gclid: null,
  email: 'user@example.com',
  phone: null,
  ts: null,
};

function deps(over: Partial<HandleDeps> = {}): HandleDeps {
  return {
    checkRate: async () => ({ allowed: true, retryAfterSec: 0 }),
    flags: () => ({ hasEmail: true, hasPhone: false }),
    persistMirror: async () => {},
    backgroundEffects: async () => {},
    log: () => {},
    ...over,
  };
}

describe('handleEvent', () => {
  it('returns 429 with Retry-After when rate limited (no persistence)', async () => {
    const persistMirror = vi.fn(async () => {});
    const res = await handleEvent(
      ev,
      { ip: '1.1.1.1', country: 'BR' },
      deps({
        checkRate: async () => ({ allowed: false, retryAfterSec: 42 }),
        persistMirror,
      }),
    );
    expect(res.status).toBe(429);
    expect(res.retryAfterSec).toBe(42);
    expect(res.background).toHaveLength(0);
    expect(persistMirror).not.toHaveBeenCalled();
  });

  it('persists the NO-PII mirror and returns 202 with a background task', async () => {
    const persistMirror = vi.fn(async () => {});
    const res = await handleEvent(ev, { ip: '1.1.1.1', country: 'BR' }, deps({ persistMirror }));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(res.retryAfterSec).toBeUndefined();
    expect(persistMirror).toHaveBeenCalledTimes(1);
    const row = persistMirror.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.has_email).toBe(true);
    expect(row.country).toBe('BR');
    expect(JSON.stringify(row)).not.toContain('user@example.com');
    expect(res.background).toHaveLength(1);
  });

  it('still returns 202 when the mirror write fails (fail-safe, logged)', async () => {
    const log = vi.fn();
    const res = await handleEvent(
      ev,
      { ip: '1.1.1.1', country: null },
      deps({
        persistMirror: async () => {
          throw new Error('supabase down');
        },
        log,
      }),
    );
    expect(res.status).toBe(202);
    expect(log).toHaveBeenCalledWith(
      'mirror_failed',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('background effects failure is swallowed and logged', async () => {
    const log = vi.fn();
    const res = await handleEvent(
      ev,
      { ip: '1.1.1.1', country: null },
      deps({
        backgroundEffects: async () => {
          throw new Error('fanout boom');
        },
        log,
      }),
    );
    await Promise.all(res.background);
    expect(log).toHaveBeenCalledWith(
      'effects_failed',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});
