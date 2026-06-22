import { describe, expect, it } from 'vitest';
import { ga4EventName, metaEventName, parseEvent } from './event.ts';

const valid = {
  event_id: 'evt_abcdef12',
  event_type: 'purchase',
  landing_page_id: '11111111-1111-1111-1111-111111111111',
  utm: { source: 'fb', medium: 'cpc', campaign: 'launch' },
  value: 49.9,
  currency: 'brl',
  event_source_url: 'https://lp.example.com/x',
  user: { email: ' User@Example.COM ', phone: '+55 (11) 99999-0000' },
};

describe('parseEvent', () => {
  it('accepts and normalizes a valid payload', () => {
    const r = parseEvent(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.eventId).toBe('evt_abcdef12');
    expect(r.value.eventType).toBe('purchase');
    expect(r.value.landingPageId).toBe('11111111-1111-1111-1111-111111111111');
    expect(r.value.utm.source).toBe('fb');
    expect(r.value.value).toBe(49.9);
    expect(r.value.currency).toBe('BRL'); // upper-cased
    expect(r.value.email).toBe('User@Example.COM'); // trimmed; kept raw (hashed later)
  });

  it('reads flat utm_* keys when no nested utm object', () => {
    const r = parseEvent({ event_id: 'evt_abcdef12', event_type: 'lead', utm_source: 'ig' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.utm.source).toBe('ig');
  });

  it('rejects a non-object body', () => {
    expect(parseEvent(null).ok).toBe(false);
    expect(parseEvent('x').ok).toBe(false);
    expect(parseEvent([]).ok).toBe(false);
  });

  it('rejects an invalid or missing event_id', () => {
    expect(parseEvent({ event_id: 'short', event_type: 'lead' }).ok).toBe(false);
    expect(parseEvent({ event_id: 'has space!!', event_type: 'lead' }).ok).toBe(false);
    expect(parseEvent({ event_type: 'lead' }).ok).toBe(false);
  });

  it('rejects an unknown event_type (allowlist)', () => {
    expect(parseEvent({ event_id: 'evt_abcdef12', event_type: 'drop_table' }).ok).toBe(false);
  });

  it('nulls invalid optionals instead of rejecting', () => {
    const r = parseEvent({
      event_id: 'evt_abcdef12',
      event_type: 'pageview',
      landing_page_id: 'not-a-uuid',
      currency: 'reais',
      value: -5,
      event_source_url: 'javascript:alert(1)',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.landingPageId).toBeNull();
    expect(r.value.currency).toBeNull();
    expect(r.value.value).toBeNull();
    expect(r.value.eventSourceUrl).toBeNull();
  });

  it('strips control characters from strings', () => {
    const r = parseEvent({
      event_id: 'evt_abcdef12',
      event_type: 'lead',
      utm_source: 'f' + String.fromCharCode(1) + 'b' + String.fromCharCode(127),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.utm.source).toBe('fb');
  });
});

describe('event name maps', () => {
  it('maps to Meta and GA4 names', () => {
    expect(metaEventName('purchase')).toBe('Purchase');
    expect(metaEventName('initiate_checkout')).toBe('InitiateCheckout');
    expect(ga4EventName('purchase')).toBe('purchase');
    expect(ga4EventName('initiate_checkout')).toBe('begin_checkout');
    expect(ga4EventName('pageview')).toBe('page_view');
  });
});
