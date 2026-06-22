import { describe, expect, it } from 'vitest';
import { buildLpEventRow } from './lp-event-row.ts';
import type { TrackingEvent } from './event.ts';

const ev: TrackingEvent = {
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

describe('buildLpEventRow', () => {
  it('maps dimensions and flags', () => {
    const row = buildLpEventRow(ev, { country: 'BR', hasEmail: true, hasPhone: true });
    expect(row.event_id).toBe('evt_abcdef12');
    expect(row.event_type).toBe('purchase');
    expect(row.utm_source).toBe('fb');
    expect(row.country).toBe('BR');
    expect(row.value).toBe(49.9);
    expect(row.has_email).toBe(true);
    expect(row.has_phone).toBe(true);
  });

  it('NEVER includes PII or click ids (NO-PII boundary)', () => {
    const row = buildLpEventRow(ev, { country: 'BR', hasEmail: true, hasPhone: true });
    const keys = Object.keys(row);
    const forbidden = [
      'email',
      'phone',
      'fbp',
      'fbc',
      'gclid',
      'ga_client_id',
      'gaClientId',
      'eventSourceUrl',
      'event_source_url',
      'ts',
    ];
    for (const k of forbidden) expect(keys).not.toContain(k);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('user@example.com');
    expect(serialized).not.toContain('5511999990000');
  });
});
