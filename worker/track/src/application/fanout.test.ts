import { describe, expect, it } from 'vitest';
import { buildCapiRequest, buildFanout, buildGa4Request } from './fanout.ts';
import type { TrackingEvent } from '../domain/event.ts';

const baseEvent: TrackingEvent = {
  eventId: 'evt_abcdef12',
  eventType: 'purchase',
  landingPageId: '11111111-1111-1111-1111-111111111111',
  utm: { source: 'fb', medium: 'cpc', campaign: 'launch', term: null, content: null },
  value: 49.9,
  currency: 'BRL',
  eventSourceUrl: 'https://lp.example.com/x',
  gaClientId: 'GA1.1.1.1',
  fbp: 'fb.1.2.3',
  fbc: 'fb.1.2.4',
  gclid: 'CjwK',
  email: 'user@example.com',
  phone: '5511999990000',
  ts: 1_700_000_000_000,
};

const client = { ip: '203.0.113.7', userAgent: 'UA/1.0' };

describe('buildCapiRequest', () => {
  it('returns null when no config (channel off)', () => {
    expect(buildCapiRequest(null, baseEvent, { em: null, ph: null }, client, 1700)).toBeNull();
  });

  it('builds a CAPI request with hashed user data and a fixed Meta host', () => {
    const req = buildCapiRequest(
      { pixelId: 'PIX', token: 'TKN' },
      baseEvent,
      { em: 'HEM', ph: 'HPH' },
      client,
      1700,
    );
    expect(req).not.toBeNull();
    if (req === null) return;
    expect(req.url.startsWith('https://graph.facebook.com/')).toBe(true);
    const body = JSON.parse(req.body) as { data: Array<Record<string, unknown>> };
    const ev = body.data[0]!;
    expect(ev.event_name).toBe('Purchase');
    expect(ev.event_id).toBe('evt_abcdef12');
    expect(ev.event_time).toBe(1_700_000_000); // ts ms -> s
    const ud = ev.user_data as Record<string, unknown>;
    expect(ud.em).toEqual(['HEM']);
    expect(ud.ph).toEqual(['HPH']);
    expect(ud.client_ip_address).toBe('203.0.113.7');
    // never the raw PII
    expect(req.body).not.toContain('user@example.com');
    expect(req.body).not.toContain('5511999990000');
  });

  it('falls back to nowSec when ts is null', () => {
    const req = buildCapiRequest(
      { pixelId: 'PIX', token: 'TKN' },
      { ...baseEvent, ts: null },
      { em: null, ph: null },
      client,
      1700,
    );
    if (req === null) throw new Error('expected request');
    const body = JSON.parse(req.body) as { data: Array<Record<string, unknown>> };
    expect(body.data[0]!.event_time).toBe(1700);
  });
});

describe('buildGa4Request', () => {
  it('returns null when no config', () => {
    expect(buildGa4Request(null, baseEvent, 'cid')).toBeNull();
  });

  it('builds a GA4 MP request with the mapped event name and gclid', () => {
    const req = buildGa4Request({ measurementId: 'G-1', apiSecret: 'SEC' }, baseEvent, 'GA1.1.1.1');
    if (req === null) throw new Error('expected request');
    expect(req.url.startsWith('https://www.google-analytics.com/mp/collect')).toBe(true);
    const body = JSON.parse(req.body) as {
      client_id: string;
      events: Array<{ name: string; params: Record<string, unknown> }>;
    };
    expect(body.client_id).toBe('GA1.1.1.1');
    expect(body.events[0]!.name).toBe('purchase');
    expect(body.events[0]!.params.gclid).toBe('CjwK');
    expect(body.events[0]!.params.value).toBe(49.9);
  });
});

describe('buildFanout', () => {
  it('aggregates only the configured channels', () => {
    const none = buildFanout(null, null, baseEvent, { em: null, ph: null }, client, 'cid', 1700);
    expect(none).toHaveLength(0);

    const both = buildFanout(
      { pixelId: 'PIX', token: 'TKN' },
      { measurementId: 'G-1', apiSecret: 'SEC' },
      baseEvent,
      { em: 'HEM', ph: null },
      client,
      'cid',
      1700,
    );
    expect(both).toHaveLength(2);
  });
});
