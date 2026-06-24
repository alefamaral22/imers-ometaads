// Onda 12 — Cripto dos segredos no dashboard (lado da ESCRITA). Espelha EXATAMENTE o formato do
// runner em scripts/onda12/domain/crypto.ts (AES-256-GCM, bundle iv||tag||ciphertext, bytea \x do
// PostgREST) — o dashboard cifra, o runner decifra; os dois precisam do mesmo formato. Mantido aqui
// (não importado de scripts/) porque o web é um workspace deployado à parte (Vercel). Puro/CPU-only.

import { randomBytes, createCipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class SecretsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretsError';
  }
}

/** Normaliza o material da chave de env para 32 bytes (64 hex OU base64). Lança se não der 32 bytes. */
export function parseKey(material: string): Buffer {
  if (typeof material !== 'string' || material.length === 0) {
    throw new SecretsError('encryption key material is empty');
  }
  if (/^[0-9a-fA-F]{64}$/.test(material)) return Buffer.from(material, 'hex');
  const fromBase64 = Buffer.from(material, 'base64');
  if (fromBase64.length === KEY_BYTES) return fromBase64;
  throw new SecretsError('encryption key must be 32 bytes (64 hex chars or base64)');
}

/** Cifra um segredo → bundle iv||tag||ciphertext (Buffer), IV aleatório por chamada. */
export function encryptSecret(plaintext: string, key: Buffer): Buffer {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new SecretsError('plaintext secret is empty');
  }
  if (key.length !== KEY_BYTES) throw new SecretsError(`key must be ${KEY_BYTES} bytes`);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/** Últimos 4 caracteres do segredo, para exibir "••••abcd" no front sem revelar o resto. */
export function last4(secret: string): string {
  if (typeof secret !== 'string') return '';
  return secret.length <= 4 ? secret : secret.slice(-4);
}

/** Serializa o bundle para o literal bytea do Postgres/PostgREST (`\x<hex>`). */
export function toPgByteaHex(blob: Buffer): string {
  return `\\x${blob.toString('hex')}`;
}

/** Cifra um segredo e devolve o que vai para o banco: ciphertext (bytea) + os últimos 4 chars. */
export function sealSecret(plaintext: string, key: Buffer): { cipherHex: string; last4: string } {
  return { cipherHex: toPgByteaHex(encryptSecret(plaintext, key)), last4: last4(plaintext) };
}
