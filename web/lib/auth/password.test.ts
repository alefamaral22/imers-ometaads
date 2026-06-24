import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('hashPassword / verifyPassword', () => {
  it('round-trips a correct password', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const hash = hashPassword('secret');
    expect(verifyPassword('Secret', hash)).toBe(false);
    expect(verifyPassword('other', hash)).toBe(false);
  });

  it('uses a fresh salt per call (same password → different hash)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('the hash is self-describing (scheme + salt + hash)', () => {
    expect(hashPassword('x').split('$')).toHaveLength(3);
    expect(hashPassword('x').startsWith('scrypt$')).toBe(true);
  });

  it('fails closed on empty/garbage inputs', () => {
    expect(verifyPassword('x', null)).toBe(false);
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(verifyPassword('x', 'scrypt$onlyone')).toBe(false);
    expect(() => hashPassword('')).toThrow();
  });
});
