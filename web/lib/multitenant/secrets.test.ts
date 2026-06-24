import { describe, it, expect } from 'vitest';
import { createDecipheriv, randomBytes } from 'node:crypto';
import { parseKey, encryptSecret, last4, toPgByteaHex, sealSecret, SecretsError } from './secrets';

const KEY = randomBytes(32);

// Decifra como o runner faz (scripts/onda12/domain/crypto.ts) — prova de compatibilidade de formato.
function runnerDecrypt(blob: Buffer, key: Buffer): string {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

describe('parseKey', () => {
  it('accepts hex and base64 of 32 bytes, rejects the rest', () => {
    expect(parseKey('a'.repeat(64))).toHaveLength(32);
    expect(parseKey(randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(() => parseKey('short')).toThrow(SecretsError);
  });
});

describe('encryptSecret / sealSecret', () => {
  it('produces a bundle the runner format can decrypt', () => {
    const blob = encryptSecret('EAAB-token', KEY);
    expect(runnerDecrypt(blob, KEY)).toBe('EAAB-token');
  });

  it('sealSecret yields a \\x bytea literal that round-trips', () => {
    const { cipherHex, last4: l4 } = sealSecret('EAAB1234wxyz', KEY);
    expect(cipherHex.startsWith('\\x')).toBe(true);
    const blob = Buffer.from(cipherHex.slice(2), 'hex');
    expect(runnerDecrypt(blob, KEY)).toBe('EAAB1234wxyz');
    expect(l4).toBe('wxyz');
  });

  it('rejects empty plaintext', () => {
    expect(() => encryptSecret('', KEY)).toThrow(SecretsError);
  });
});

describe('last4 / toPgByteaHex', () => {
  it('last4 returns the tail or the whole short string', () => {
    expect(last4('abcdef')).toBe('cdef');
    expect(last4('ab')).toBe('ab');
  });

  it('toPgByteaHex prefixes \\x', () => {
    expect(toPgByteaHex(Buffer.from([0xde, 0xad]))).toBe('\\xdead');
  });
});
