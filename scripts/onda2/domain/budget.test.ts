import { describe, it, expect } from 'vitest';
import { clampDailyBudgetCents, isWithinBudgetCap } from './budget.ts';
import { ValidationError } from './validation.ts';

describe('clampDailyBudgetCents', () => {
  it('keeps a request that is within the cap', () => {
    expect(clampDailyBudgetCents(3000, 5000)).toBe(3000);
  });

  it('clamps a request above the cap down to the cap (never above)', () => {
    expect(clampDailyBudgetCents(9000, 5000)).toBe(5000);
  });

  it('uses the cap when the request is 0 (default budget)', () => {
    expect(clampDailyBudgetCents(0, 5000)).toBe(5000);
  });

  it('aborts when the cap is 0', () => {
    expect(() => clampDailyBudgetCents(1000, 0)).toThrow(ValidationError);
  });

  it('rejects non-integer / negative cents', () => {
    expect(() => clampDailyBudgetCents(1.5, 5000)).toThrow(ValidationError);
    expect(() => clampDailyBudgetCents(-1, 5000)).toThrow(ValidationError);
    expect(() => clampDailyBudgetCents(100, -5)).toThrow(ValidationError);
  });
});

describe('isWithinBudgetCap', () => {
  it('is true only for 1..cap inclusive', () => {
    expect(isWithinBudgetCap(1, 5000)).toBe(true);
    expect(isWithinBudgetCap(5000, 5000)).toBe(true);
    expect(isWithinBudgetCap(5001, 5000)).toBe(false);
    expect(isWithinBudgetCap(0, 5000)).toBe(false);
  });
});
