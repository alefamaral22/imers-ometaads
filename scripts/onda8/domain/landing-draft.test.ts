import { describe, expect, it } from 'vitest';
import { assertDraftInvariants, isSectionType, type DraftSection } from './landing-draft.ts';

function section(type: string, position: number): DraftSection {
  return { type: type as DraftSection['type'], position, enabled: true, version: 1, fields: {} };
}

describe('isSectionType', () => {
  it('accepts catalog types and rejects others', () => {
    expect(isSectionType('hero')).toBe(true);
    expect(isSectionType('footer')).toBe(true);
    expect(isSectionType('banana')).toBe(false);
    expect(isSectionType(42)).toBe(false);
  });
});

describe('assertDraftInvariants', () => {
  it('passes for a valid draft with a hero', () => {
    expect(() => assertDraftInvariants([section('hero', 0), section('features', 1)])).not.toThrow();
  });

  it('rejects an empty draft', () => {
    expect(() => assertDraftInvariants([])).toThrow();
  });

  it('rejects a draft without a hero', () => {
    expect(() => assertDraftInvariants([section('features', 0)])).toThrow(/hero/);
  });

  it('rejects duplicate section types', () => {
    expect(() => assertDraftInvariants([section('hero', 0), section('hero', 1)])).toThrow(
      /duplicate/,
    );
  });

  it('rejects an unknown section type', () => {
    expect(() => assertDraftInvariants([section('hero', 0), section('xyz', 1)])).toThrow();
  });

  it('rejects a negative position', () => {
    expect(() => assertDraftInvariants([section('hero', -1)])).toThrow();
  });
});
