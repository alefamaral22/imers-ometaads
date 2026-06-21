import { describe, expect, it } from 'vitest';
import { costPerEventCents, currencyToCents, safeRatio, toCount } from './money.ts';

describe('currencyToCents', () => {
  it('converts currency units (string/number) to integer cents', () => {
    expect(currencyToCents('12.34')).toBe(1234);
    expect(currencyToCents(9.999)).toBe(1000); // rounds
    expect(currencyToCents('0')).toBe(0);
  });
  it('returns null for missing/invalid (null != 0)', () => {
    expect(currencyToCents(null)).toBeNull();
    expect(currencyToCents(undefined)).toBeNull();
    expect(currencyToCents('abc')).toBeNull();
  });
});

describe('toCount', () => {
  it('parses non-negative integers, rejecting negatives/invalid', () => {
    expect(toCount('100')).toBe(100);
    expect(toCount(3.6)).toBe(4);
    expect(toCount(-1)).toBeNull();
    expect(toCount('x')).toBeNull();
    expect(toCount(undefined)).toBeNull();
  });
});

describe('safeRatio', () => {
  it('rounds to 6 decimals and guards divide-by-zero', () => {
    expect(safeRatio(1, 3)).toBe(0.333333);
    expect(safeRatio(5, 0)).toBeNull();
    expect(safeRatio(null, 2)).toBeNull();
  });
});

describe('costPerEventCents', () => {
  it('divides spend by count, null when count <= 0', () => {
    expect(costPerEventCents(1000, 4)).toBe(250);
    expect(costPerEventCents(1000, 0)).toBeNull();
    expect(costPerEventCents(null, 4)).toBeNull();
  });
});
