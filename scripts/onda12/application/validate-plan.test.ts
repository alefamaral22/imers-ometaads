import { describe, it, expect } from 'vitest';
import { planConnectionPatch } from './validate-plan.ts';

const NOW = '2026-06-24T12:00:00.000Z';

describe('planConnectionPatch', () => {
  it('ok → status active, clears the error, no notify', () => {
    const p = planConnectionPatch({ kind: 'ok' }, 'act_123', NOW);
    expect(p.patch).toEqual({
      status: 'active',
      last_validated_at: NOW,
      last_validation_error: null,
    });
    expect(p.notify).toBe(false);
  });

  it('auth_error → status revoked, records error, notifies the gestor', () => {
    const p = planConnectionPatch({ kind: 'auth_error', error: 'code 190' }, 'act_123', NOW);
    expect(p.patch.status).toBe('revoked');
    expect(p.patch.last_validation_error).toBe('code 190');
    expect(p.notify).toBe(true);
    expect(p.message).toContain('act_123');
  });

  it('transient → keeps status (no status key), records error, no notify', () => {
    const p = planConnectionPatch({ kind: 'transient', error: 'http 503' }, 'act_123', NOW);
    expect(p.patch).toEqual({ last_validation_error: 'http 503' });
    expect('status' in p.patch).toBe(false);
    expect(p.notify).toBe(false);
  });

  it('never leaks a token into the notify message', () => {
    const p = planConnectionPatch({ kind: 'auth_error', error: 'x' }, 'act_123', NOW);
    expect(p.message ?? '').not.toContain('EAA');
  });
});
