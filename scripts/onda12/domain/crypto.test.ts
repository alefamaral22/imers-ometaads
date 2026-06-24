import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  parseKey,
  encryptSecret,
  decryptSecret,
  last4,
  toPgByteaHex,
  fromPgByteaHex,
  SecretsError,
} from './crypto.ts';

const KEY = randomBytes(32);

describe('parseKey', () => {
  it('accepts 64 hex chars', () => {
    expect(parseKey('a'.repeat(64))).toHaveLength(32);
  });

  it('accepts base64 of 32 bytes', () => {
    expect(parseKey(randomBytes(32).toString('base64'))).toHaveLength(32);
  });

  it('rejects empty and wrong-length material', () => {
    expect(() => parseKey('')).toThrow(SecretsError);
    expect(() => parseKey('deadbeef')).toThrow(SecretsError);
    expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow(SecretsError);
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    const blob = encryptSecret('EAAB-system-user-token', KEY);
    expect(decryptSecret(blob, KEY)).toBe('EAAB-system-user-token');
  });

  it('uses a fresh IV per call (same plaintext → different ciphertext)', () => {
    const a = encryptSecret('same', KEY);
    const b = encryptSecret('same', KEY);
    expect(a.equals(b)).toBe(false);
    expect(decryptSecret(a, KEY)).toBe(decryptSecret(b, KEY));
  });

  it('fails closed with the wrong key', () => {
    const blob = encryptSecret('secret', KEY);
    expect(() => decryptSecret(blob, randomBytes(32))).toThrow(SecretsError);
  });

  it('fails closed when the ciphertext is tampered', () => {
    const blob = encryptSecret('secret', KEY);
    const last = blob.length - 1;
    blob[last] = (blob[last] ?? 0) ^ 0xff; // flip a bit in the ciphertext
    expect(() => decryptSecret(blob, KEY)).toThrow(SecretsError);
  });

  it('rejects empty plaintext and short bundles', () => {
    expect(() => encryptSecret('', KEY)).toThrow(SecretsError);
    expect(() => decryptSecret(Buffer.alloc(5), KEY)).toThrow(SecretsError);
  });
});

describe('last4', () => {
  it('returns the last four characters', () => {
    expect(last4('EAAB1234abcd')).toBe('abcd');
  });

  it('returns the whole string when shorter than 4', () => {
    expect(last4('ab')).toBe('ab');
  });
});

describe('pg bytea boundary', () => {
  it('round-trips a bundle through the bytea hex literal', () => {
    const blob = encryptSecret('secret', KEY);
    const literal = toPgByteaHex(blob);
    expect(literal.startsWith('\\x')).toBe(true);
    expect(fromPgByteaHex(literal).equals(blob)).toBe(true);
  });

  it('rejects a non-bytea string', () => {
    expect(() => fromPgByteaHex('nope')).toThrow(SecretsError);
  });
});
