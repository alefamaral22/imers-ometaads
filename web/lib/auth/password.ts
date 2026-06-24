/**
 * Onda 13 — Hash de senha de login com scrypt (node:crypto). KDF lento → resistente a brute-force
 * offline; sem dependência externa nem binário nativo (roda igual na Vercel e no Fly). Formato
 * autodescritivo `scrypt$<saltHex>$<hashHex>`. Pura (CPU-only), testável. Verificação timing-safe.
 */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SCHEME = 'scrypt';
const KEY_LEN = 64;
const SALT_LEN = 16;

/** Gera o hash de uma senha em texto puro. Salt aleatório por chamada. */
export function hashPassword(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('password is empty');
  }
  const salt = randomBytes(SALT_LEN);
  const derived = scryptSync(plain, salt, KEY_LEN);
  return `${SCHEME}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Verifica uma senha contra o hash guardado. Falha fechada (false) em qualquer formato inesperado. */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored || typeof plain !== 'string' || plain.length === 0) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== SCHEME) return false;
  const salt = Buffer.from(parts[1] as string, 'hex');
  const expected = Buffer.from(parts[2] as string, 'hex');
  if (salt.length === 0 || expected.length !== KEY_LEN) return false;
  const derived = scryptSync(plain, salt, KEY_LEN);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
