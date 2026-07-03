import { describe, it, expect, vi } from 'vitest';
import {
  createCampaign,
  createAdSet,
  createCreative,
  createAd,
  MetaGraphError,
} from './meta-graph-client.ts';
import {
  buildAdPayload,
  buildAdSetPayload,
  buildCampaignPayload,
  buildCreativePayload,
} from '../domain/meta-payload.ts';

const cfg = { adAccountId: 'act_123', token: 'system-user-token' };

function fetchOk(id: string) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id }) });
}

function fetchFail(status: number, body = 'nope') {
  return vi.fn().mockResolvedValue({ ok: false, status, text: async () => body });
}

describe('createCampaign', () => {
  it('posts to <ad_account>/campaigns with the campaign payload', async () => {
    const fetchImpl = fetchOk('cmp_1');
    const payload = buildCampaignPayload('Campanha X');
    const result = await createCampaign(cfg, payload, fetchImpl);
    expect(result).toEqual({ id: 'cmp_1' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/act_123/campaigns');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer system-user-token' });
    expect(JSON.parse(init.body as string)).toMatchObject({ name: 'Campanha X', status: 'PAUSED' });
  });

  it('throws MetaGraphError on non-ok response without leaking the token', async () => {
    const fetchImpl = fetchFail(401, 'invalid token');
    const payload = buildCampaignPayload('Campanha X');
    await expect(createCampaign(cfg, payload, fetchImpl)).rejects.toThrow(MetaGraphError);
    try {
      await createCampaign(cfg, payload, fetchImpl);
    } catch (e) {
      expect(e).toBeInstanceOf(MetaGraphError);
      expect((e as Error).message).not.toContain('system-user-token');
    }
  });
});

describe('createAdSet', () => {
  it('posts to <ad_account>/adsets with campaign_id attached', async () => {
    const fetchImpl = fetchOk('as_1');
    const payload = buildAdSetPayload({
      name: 'AS',
      requestedDailyBudgetCents: 5000,
      capCents: 5000,
    });
    const result = await createAdSet(cfg, 'cmp_1', payload, fetchImpl);
    expect(result).toEqual({ id: 'as_1' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/act_123/adsets');
    expect(JSON.parse(init.body as string)).toMatchObject({
      campaign_id: 'cmp_1',
      status: 'PAUSED',
    });
  });
});

describe('createCreative', () => {
  it('posts to <ad_account>/adcreatives', async () => {
    const fetchImpl = fetchOk('cr_1');
    const payload = buildCreativePayload({
      name: 'CR',
      pageId: 'PAGE_1',
      linkUrl: 'https://cliente.example.com',
      imageUrl: 'https://ref.supabase.co/storage/v1/object/public/ad-ingest/x.png',
      copy: { angle: 'offer', headline: 'H', primaryText: 'P', description: 'D', cta: 'SIGN_UP' },
    });
    const result = await createCreative(cfg, payload, fetchImpl);
    expect(result).toEqual({ id: 'cr_1' });
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/act_123/adcreatives');
  });
});

describe('createAd', () => {
  it('posts to <ad_account>/ads with adset_id and creative_id attached', async () => {
    const fetchImpl = fetchOk('ad_1');
    const payload = buildAdPayload('Ad 1');
    const result = await createAd(cfg, 'as_1', 'cr_1', payload, fetchImpl);
    expect(result).toEqual({ id: 'ad_1' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/act_123/ads');
    expect(JSON.parse(init.body as string)).toMatchObject({
      adset_id: 'as_1',
      creative: { creative_id: 'cr_1' },
      status: 'PAUSED',
    });
  });
});
