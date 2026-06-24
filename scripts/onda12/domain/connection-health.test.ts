import { describe, it, expect } from 'vitest';
import { classifyMetaProbe } from './connection-health.ts';

describe('classifyMetaProbe', () => {
  it('healthy probe → ok', () => {
    expect(classifyMetaProbe({ ok: true, httpStatus: 200 })).toEqual({ kind: 'ok' });
  });

  it('revoked/invalid token (code 190) → auth_error', () => {
    const d = classifyMetaProbe({
      ok: false,
      httpStatus: 400,
      errorCode: 190,
      errorMessage: 'revoked',
    });
    expect(d.kind).toBe('auth_error');
  });

  it('http 401/403 → auth_error even without a code', () => {
    expect(classifyMetaProbe({ ok: false, httpStatus: 401 }).kind).toBe('auth_error');
    expect(classifyMetaProbe({ ok: false, httpStatus: 403 }).kind).toBe('auth_error');
  });

  it('permission error (code 200/10) → auth_error', () => {
    expect(classifyMetaProbe({ ok: false, httpStatus: 400, errorCode: 200 }).kind).toBe(
      'auth_error',
    );
    expect(classifyMetaProbe({ ok: false, httpStatus: 400, errorCode: 10 }).kind).toBe(
      'auth_error',
    );
  });

  it('rate limit / 5xx → transient (does not condemn the token)', () => {
    expect(classifyMetaProbe({ ok: false, httpStatus: 429, errorCode: 4 }).kind).toBe('transient');
    expect(classifyMetaProbe({ ok: false, httpStatus: 500 }).kind).toBe('transient');
    expect(classifyMetaProbe({ ok: false, httpStatus: 503 }).kind).toBe('transient');
  });

  it('carries a non-empty error message on failures', () => {
    const d = classifyMetaProbe({ ok: false, httpStatus: 500 });
    if (d.kind !== 'ok') expect(d.error.length).toBeGreaterThan(0);
  });
});
