import { describe, expect, it, vi } from 'vitest';
import { insertMany, insertReturning, type SupabaseRestConfig } from './analytics-rest.ts';

const cfg: SupabaseRestConfig = { url: 'https://ref.supabase.co/', secretKey: 'service-key' };

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(body: unknown, init?: { ok?: boolean; status?: number }) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: unknown, reqInit: unknown) => {
    calls.push({ url: String(url), init: (reqInit ?? {}) as RequestInit });
    return {
      ok: init?.ok ?? true,
      status: init?.status ?? 201,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('insertReturning', () => {
  it('POSTs return=representation and returns the first row (id of analyses)', async () => {
    const { fn, calls } = fakeFetch([{ id: 'an-1' }]);
    const row = await insertReturning(cfg, 'analyses', { client_id: 'c' }, fn);
    expect(row.id).toBe('an-1');
    expect(calls[0]?.url).toBe('https://ref.supabase.co/rest/v1/analyses');
    expect((calls[0]?.init.headers as Record<string, string>).Prefer).toContain(
      'return=representation',
    );
  });

  it('throws on a non-ok response', async () => {
    const { fn } = fakeFetch({ message: 'denied' }, { ok: false, status: 403 });
    await expect(insertReturning(cfg, 'analyses', {}, fn)).rejects.toThrow(
      /analyses failed \(403\)/,
    );
  });
});

describe('insertMany', () => {
  it('sends all rows in a single POST', async () => {
    const { fn, calls } = fakeFetch(null);
    await insertMany(cfg, 'funnel_events', [{ step_order: 1 }, { step_order: 2 }], fn);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0]?.init.body))).toHaveLength(2);
  });

  it('is a no-op for an empty array (no request)', async () => {
    const { fn, calls } = fakeFetch(null);
    await insertMany(cfg, 'funnel_events', [], fn);
    expect(calls).toHaveLength(0);
  });
});
