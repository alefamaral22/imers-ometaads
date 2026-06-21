import { describe, it, expect } from 'vitest';
import { parseContentDoc } from '../content-doc.js';
import { SECTION_TYPES } from '../sections/schemas.js';
import { sampleDoc } from './fixtures.js';

describe('ContentDoc schema', () => {
  it('declares exactly 17 sections in the catalog', () => {
    expect(SECTION_TYPES).toHaveLength(17);
    expect(new Set(SECTION_TYPES).size).toBe(17);
  });

  it('accepts a valid ContentDoc', () => {
    expect(() => parseContentDoc(sampleDoc)).not.toThrow();
  });

  it('rejects duplicate section types', () => {
    const dup = {
      ...sampleDoc,
      sections: [sampleDoc.sections[0], sampleDoc.sections[0]],
    };
    expect(() => parseContentDoc(dup)).toThrow(/duplicate section type/);
  });

  it('rejects unknown section type (discriminated union)', () => {
    const bad = {
      ...sampleDoc,
      sections: [{ type: 'banner', position: 0, enabled: true, version: 1, fields: {} }],
    };
    expect(() => parseContentDoc(bad)).toThrow();
  });

  it('rejects unknown extra fields (strict)', () => {
    const bad = { ...sampleDoc, extra: true };
    expect(() => parseContentDoc(bad)).toThrow();
  });

  it('rejects a hero with an unknown field key (per-section strict)', () => {
    const bad = structuredClone(sampleDoc) as unknown as Record<string, unknown>;
    (bad.sections as { fields: Record<string, unknown> }[])[0]!.fields.evil = '<script>';
    expect(() => parseContentDoc(bad)).toThrow();
  });

  it('rejects a non-https checkout url', () => {
    const bad = structuredClone(sampleDoc);
    bad.settings.checkoutUrl = 'http://insecure.example.com';
    expect(() => parseContentDoc(bad)).toThrow();
  });

  it('rejects an invalid subdomain', () => {
    const bad = structuredClone(sampleDoc);
    bad.settings.subdomain = 'Not Valid';
    expect(() => parseContentDoc(bad)).toThrow();
  });
});
