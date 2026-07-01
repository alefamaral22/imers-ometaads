import { describe, expect, it } from 'vitest';
import { classifyKeyProbe, statusFromDecision } from './provider-health';

describe('classifyKeyProbe', () => {
  it('2xx → ok', () => {
    expect(classifyKeyProbe({ ok: true, httpStatus: 200 })).toEqual({ kind: 'ok' });
  });

  it('401/403 → auth_error (chave inválida)', () => {
    expect(classifyKeyProbe({ ok: false, httpStatus: 401 })).toEqual({ kind: 'auth_error' });
    expect(classifyKeyProbe({ ok: false, httpStatus: 403 })).toEqual({ kind: 'auth_error' });
  });

  it('429/5xx/rede → transient (não condena a chave)', () => {
    expect(classifyKeyProbe({ ok: false, httpStatus: 429 })).toEqual({ kind: 'transient' });
    expect(classifyKeyProbe({ ok: false, httpStatus: 500 })).toEqual({ kind: 'transient' });
    expect(classifyKeyProbe({ ok: false, httpStatus: 0 })).toEqual({ kind: 'transient' });
  });
});

describe('statusFromDecision', () => {
  it('mapeia decisão → api_key_status', () => {
    expect(statusFromDecision({ kind: 'ok' })).toBe('active');
    expect(statusFromDecision({ kind: 'auth_error' })).toBe('invalid');
    expect(statusFromDecision({ kind: 'transient' })).toBe('unverified');
  });
});
