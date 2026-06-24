import { describe, expect, it } from 'vitest';
import { JOB_SLUGS, listJobSlugs, resolveJobSlug } from './allowlist';

describe('resolveJobSlug', () => {
  it('resolves known slugs to a real skill name + job kind', () => {
    expect(resolveJobSlug('activate')).toEqual({
      slug: 'activate',
      skill: 'activate-campaign-cliente-exemplo',
      kind: 'activate',
    });
    expect(resolveJobSlug('create-sales')?.kind).toBe('create_sales');
    expect(resolveJobSlug('analyze')?.skill).toBe('funnel-analytics-cliente-exemplo-campaign');
  });

  it('returns null for unknown / free-text slugs (deny-by-default)', () => {
    expect(resolveJobSlug('rm -rf')).toBeNull();
    expect(resolveJobSlug('')).toBeNull();
    expect(resolveJobSlug('__proto__')).toBeNull();
    expect(resolveJobSlug('constructor')).toBeNull();
  });

  it('every allowlisted kind is a valid job_kind', () => {
    const valid = new Set([
      'create',
      'create_sales',
      'activate',
      'analyze',
      'summarize',
      'landing',
      'landing_publish',
      'landing_edit',
      'snapshot',
    ]);
    for (const slug of listJobSlugs()) {
      expect(valid.has(JOB_SLUGS[slug].kind)).toBe(true);
    }
  });
});
