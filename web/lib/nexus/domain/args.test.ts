import { describe, expect, it } from 'vitest';
import { parseJobArgs } from './args';

describe('parseJobArgs', () => {
  it('accepts allowlisted keys with safe charset', () => {
    expect(parseJobArgs({ client_slug: 'cliente-exemplo', campaign_id: 'a1b2-3c4d' })).toEqual({
      client_slug: 'cliente-exemplo',
      campaign_id: 'a1b2-3c4d',
    });
    expect(parseJobArgs(null)).toEqual({});
  });

  it('rejects shell metacharacters / prompt-injection in values', () => {
    expect(() => parseJobArgs({ client_slug: 'a; rm -rf /' })).toThrow();
    expect(() => parseJobArgs({ client_slug: 'a && curl evil' })).toThrow();
    expect(() => parseJobArgs({ client_slug: '$(whoami)' })).toThrow();
    expect(() => parseJobArgs({ client_slug: 'a`b`' })).toThrow();
  });

  it('rejects unknown keys (deny-by-default)', () => {
    expect(() => parseJobArgs({ confirm: 'true' })).toThrow();
    expect(() => parseJobArgs({ skill: 'whatever' })).toThrow();
  });

  it('rejects overly long values', () => {
    expect(() => parseJobArgs({ client_slug: 'a'.repeat(201) })).toThrow();
  });

  it('accepts inputs_token (UUID) na allowlist', () => {
    const token = '11111111-2222-3333-4444-555555555555';
    expect(parseJobArgs({ client_slug: 'x', inputs_token: token })).toEqual({
      client_slug: 'x',
      inputs_token: token,
    });
  });
});
