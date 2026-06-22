import { describe, expect, it } from 'vitest';
import { evaluateRate, type RateWindow } from './ratelimit.ts';

describe('evaluateRate', () => {
  it('starts a fresh window when there is no prior state', () => {
    const r = evaluateRate(null, 1000, 60000, 3);
    expect(r.allowed).toBe(true);
    expect(r.next).toEqual({ count: 1, resetAt: 61000 });
  });

  it('increments within the window while under max', () => {
    const prev: RateWindow = { count: 1, resetAt: 61000 };
    const r = evaluateRate(prev, 2000, 60000, 3);
    expect(r.allowed).toBe(true);
    expect(r.next.count).toBe(2);
    expect(r.next.resetAt).toBe(61000); // window unchanged
  });

  it('blocks when max reached, with a positive Retry-After', () => {
    const prev: RateWindow = { count: 3, resetAt: 61000 };
    const r = evaluateRate(prev, 2000, 60000, 3);
    expect(r.allowed).toBe(false);
    expect(r.next).toBe(prev); // not persisted/changed
    expect(r.retryAfterSec).toBe(59);
  });

  it('resets once the window has elapsed', () => {
    const prev: RateWindow = { count: 99, resetAt: 61000 };
    const r = evaluateRate(prev, 61000, 60000, 3);
    expect(r.allowed).toBe(true);
    expect(r.next).toEqual({ count: 1, resetAt: 121000 });
  });
});
