import { describe, expect, it } from 'vitest';
import { applyEditPath, editSectionSchema, nextVersion, reconcile } from './edit';

describe('reconcile (optimistic concurrency)', () => {
  it('accepts a matching version and rejects a stale one', () => {
    expect(reconcile(3, 3)).toBe(true);
    expect(reconcile(4, 3)).toBe(false);
    expect(nextVersion(3)).toBe(4);
  });
});

describe('applyEditPath', () => {
  it('sets a top-level field immutably', () => {
    const before = { headline: 'old' };
    const after = applyEditPath(before, 'headline', 'new');
    expect(after.headline).toBe('new');
    expect(before.headline).toBe('old'); // input untouched
  });

  it('sets a nested field, creating intermediate objects', () => {
    const after = applyEditPath({}, 'cta.label', 'Comprar');
    expect(after).toEqual({ cta: { label: 'Comprar' } });
  });

  it('rejects prototype-pollution segments', () => {
    expect(() => applyEditPath({}, '__proto__.polluted', true)).toThrow();
    expect(() => applyEditPath({}, 'constructor', 'x')).toThrow();
  });
});

describe('editSectionSchema', () => {
  it('accepts a valid edit and rejects an unknown type / bad path', () => {
    expect(
      editSectionSchema.safeParse({
        landing_page_id: '11111111-1111-1111-1111-111111111111',
        type: 'hero',
        path: 'cta.label',
        value: 'Comprar',
        expectedVersion: 1,
      }).success,
    ).toBe(true);
    expect(
      editSectionSchema.safeParse({
        landing_page_id: '11111111-1111-1111-1111-111111111111',
        type: 'banana',
        path: 'x',
        value: 'y',
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      editSectionSchema.safeParse({
        landing_page_id: '11111111-1111-1111-1111-111111111111',
        type: 'hero',
        path: 'a..b',
        value: 'y',
        expectedVersion: 1,
      }).success,
    ).toBe(false);
  });
});
