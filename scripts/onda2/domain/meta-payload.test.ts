import { describe, it, expect } from 'vitest';
import {
  buildCampaignPayload,
  buildAdSetPayload,
  buildCreativePayload,
  buildAdPayload,
  PAUSED,
  TRAFFIC_OBJECTIVE,
} from './meta-payload.ts';
import { ValidationError } from './validation.ts';
import type { AdCopy } from './angles.ts';

const sampleCopy: AdCopy = {
  angle: 'offer',
  headline: 'Headline',
  primaryText: 'Primary',
  description: 'Desc',
  cta: 'SIGN_UP',
};

describe('buildCampaignPayload', () => {
  it('always creates the campaign PAUSED with OUTCOME_TRAFFIC', () => {
    const c = buildCampaignPayload('My campaign');
    expect(c.status).toBe(PAUSED);
    expect(c.objective).toBe(TRAFFIC_OBJECTIVE);
    expect(c.special_ad_categories).toEqual([]);
  });
});

describe('buildAdSetPayload', () => {
  it('emits a PAUSED ad set with budget clamped to the cap', () => {
    const a = buildAdSetPayload({ name: 'AS', requestedDailyBudgetCents: 9999, capCents: 5000 });
    expect(a.status).toBe(PAUSED);
    expect(a.daily_budget).toBe(5000);
  });

  it('refuses to build above the cap', () => {
    expect(() => buildAdSetPayload({ name: 'AS', requestedDailyBudgetCents: 100, capCents: 0 })).toThrow(
      ValidationError,
    );
  });
});

describe('buildCreativePayload', () => {
  it('puts the public image url inline in link_data.picture', () => {
    const cr = buildCreativePayload({
      name: 'CR',
      pageId: 'PAGE_1',
      linkUrl: 'https://cliente-exemplo.example.com',
      imageUrl: 'https://ref.supabase.co/storage/v1/object/public/ad-ingest/x.png',
      copy: sampleCopy,
    });
    expect(cr.object_story_spec.link_data.picture).toContain('/ad-ingest/');
    expect(cr.object_story_spec.link_data.call_to_action.type).toBe('SIGN_UP');
    expect(cr.object_story_spec.page_id).toBe('PAGE_1');
  });

  it('rejects a non-https image url (Meta fetches it publicly)', () => {
    expect(() =>
      buildCreativePayload({
        name: 'CR',
        pageId: 'PAGE_1',
        linkUrl: 'https://x.example.com',
        imageUrl: 'http://insecure/x.png',
        copy: sampleCopy,
      }),
    ).toThrow(ValidationError);
  });
});

describe('buildAdPayload', () => {
  it('creates the ad PAUSED', () => {
    expect(buildAdPayload('Ad').status).toBe(PAUSED);
  });
});
