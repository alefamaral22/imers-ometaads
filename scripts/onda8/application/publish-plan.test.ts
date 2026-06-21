import { describe, expect, it } from 'vitest';
import { assembleContentDoc, publishPatch } from './publish-plan.ts';
import { buildLandingPageRow, buildSectionRow } from './persistence-rows.ts';

describe('buildLandingPageRow', () => {
  it('creates a draft, noindex, with content in the row (not files)', () => {
    const row = buildLandingPageRow({
      clientId: 'c1',
      subdomain: 'curso-exemplo',
      settings: { subdomain: 'curso-exemplo' },
      theme: { primary: '#000' },
      priceCents: 19700,
    });
    expect(row).toMatchObject({
      status: 'draft',
      noindex: true,
      draft_status: 'ready',
      cart_state: 'closed',
    });
    expect(row.price_cents).toBe(19700);
    expect(row.product_id).toBeNull();
  });
});

describe('assembleContentDoc', () => {
  const lp = { settings: { subdomain: 'curso-exemplo' }, theme: { primary: '#000' } };
  const rows = [
    buildSectionRow('lp1', {
      type: 'features',
      position: 1,
      enabled: true,
      version: 1,
      fields: { headline: 'F' },
    }),
    buildSectionRow('lp1', {
      type: 'hero',
      position: 0,
      enabled: true,
      version: 1,
      fields: { headline: 'H' },
    }),
    buildSectionRow('lp1', { type: 'about', position: 2, enabled: false, version: 1, fields: {} }),
  ];

  it('orders enabled sections by position and validates invariants', () => {
    const doc = assembleContentDoc(lp, rows);
    expect(doc.sections.map((s) => s.type)).toEqual(['hero', 'features']); // disabled "about" dropped
    expect(doc.settings).toEqual(lp.settings);
  });

  it('throws when settings/theme are missing', () => {
    expect(() => assembleContentDoc({ settings: null, theme: {} }, rows)).toThrow();
  });

  it('throws when there is no hero among enabled sections', () => {
    const noHero = [
      buildSectionRow('lp1', {
        type: 'features',
        position: 0,
        enabled: true,
        version: 1,
        fields: {},
      }),
    ];
    expect(() => assembleContentDoc(lp, noHero)).toThrow(/hero/);
  });
});

describe('publishPatch', () => {
  it('marks deployed with url and snapshot', () => {
    const p = publishPatch({
      url: 'https://curso-exemplo.example.com',
      fqdn: 'curso-exemplo.example.com',
      snapshot: { v: 1 },
    });
    expect(p).toMatchObject({ status: 'deployed', ssl_status: 'active', draft_status: 'ready' });
    expect(p.url).toContain('example.com');
  });
});
