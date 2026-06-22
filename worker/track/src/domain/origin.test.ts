import { describe, expect, it } from 'vitest';
import { corsHeaders, isAllowedOrigin } from './origin.ts';

describe('isAllowedOrigin', () => {
  it('allows the apex and subdomains over HTTPS', () => {
    expect(isAllowedOrigin('https://example.com', 'example.com')).toBe(true);
    expect(isAllowedOrigin('https://lp.example.com', 'example.com')).toBe(true);
    expect(isAllowedOrigin('https://a.b.example.com', 'example.com')).toBe(true);
  });

  it('normalizes a leading-dot suffix', () => {
    expect(isAllowedOrigin('https://lp.example.com', '.example.com')).toBe(true);
  });

  it('rejects look-alike hosts (dot boundary)', () => {
    expect(isAllowedOrigin('https://evilexample.com', 'example.com')).toBe(false);
    expect(isAllowedOrigin('https://example.com.attacker.com', 'example.com')).toBe(false);
  });

  it('rejects non-https, null, empty and malformed origins', () => {
    expect(isAllowedOrigin('http://lp.example.com', 'example.com')).toBe(false);
    expect(isAllowedOrigin(null, 'example.com')).toBe(false);
    expect(isAllowedOrigin('', 'example.com')).toBe(false);
    expect(isAllowedOrigin('not a url', 'example.com')).toBe(false);
  });

  it('rejects everything when the suffix is empty', () => {
    expect(isAllowedOrigin('https://lp.example.com', '')).toBe(false);
  });
});

describe('corsHeaders', () => {
  it('reflects the origin (no wildcard) and varies on Origin', () => {
    const h = corsHeaders('https://lp.example.com');
    expect(h['Access-Control-Allow-Origin']).toBe('https://lp.example.com');
    expect(h['Access-Control-Allow-Origin']).not.toBe('*');
    expect(h.Vary).toBe('Origin');
  });
});
