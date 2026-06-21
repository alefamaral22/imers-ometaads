import { describe, expect, it } from 'vitest';
import { buildPendingAction, isConfirmation } from './confirmation';

describe('buildPendingAction', () => {
  it('builds a pending action for a known slug + safe args', () => {
    const p = buildPendingAction('activate', { campaign_id: 'camp-1' }, { id: 'tok-123' });
    expect(p).not.toBeNull();
    expect(p?.skill).toBe('activate-campaign-cliente-exemplo');
    expect(p?.kind).toBe('activate');
    expect(p?.summary).toContain('ATIVAR');
    expect(p?.id).toBe('tok-123');
  });

  it('returns null for an unknown slug (free text is never a skill name)', () => {
    expect(buildPendingAction('do-evil', {}, { id: 't' })).toBeNull();
  });

  it('throws when args carry an injection payload', () => {
    expect(() =>
      buildPendingAction('create-traffic', { client_slug: 'x; reboot' }, { id: 't' }),
    ).toThrow();
  });
});

describe('isConfirmation (two-turn)', () => {
  const pending = buildPendingAction(
    'create-traffic',
    { client_slug: 'cliente-exemplo' },
    { id: 'abc123' },
  )!;

  it('confirms only when the exact pending id token is echoed', () => {
    expect(isConfirmation(pending, 'abc123')).toBe(true);
  });

  it('refuses a wrong / empty / non-string token (no free confirm=true)', () => {
    expect(isConfirmation(pending, 'abc124')).toBe(false);
    expect(isConfirmation(pending, '')).toBe(false);
    expect(isConfirmation(pending, true as unknown)).toBe(false);
    expect(isConfirmation(pending, 'abc12')).toBe(false); // length mismatch
  });
});
