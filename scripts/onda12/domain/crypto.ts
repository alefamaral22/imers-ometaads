// Onda 12 — Criptografia app-level dos segredos por tenant (ADR 0027).
// AES-256-GCM: o DB guarda só iv||authTag||ciphertext; a chave (32 bytes) vive em env, NUNCA no banco.
// Lógica pura (só CPU, sem I/O) → testável e contável na cobertura. A fronteira bytea do PostgREST
// (formato hex `\x…`) é tratada aqui para o infra só passar/ler strings.

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM nonce recomendado
const TAG_BYTES = 16; // GCM auth tag

/** Erro de segredo/cripto — separado de validações de domínio comuns para ser fácil de mapear. */
export class SecretsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretsError';
  }
}

/**
 * Normaliza o material da chave de env (`AD_TOKEN_ENC_KEY` / `API_KEY_ENC_KEY`) para 32 bytes.
 * Aceita 64 chars hex OU base64 de 32 bytes. Lança se não der exatamente 32 bytes — uma chave
 * curta enfraquece silenciosamente a cifra.
 */
export function parseKey(material: string): Buffer {
  if (typeof material !== 'string' || material.length === 0) {
    throw new SecretsError('encryption key material is empty');
  }
  if (/^[0-9a-fA-F]{64}$/.test(material)) {
    return Buffer.from(material, 'hex');
  }
  const fromBase64 = Buffer.from(material, 'base64');
  if (fromBase64.length === KEY_BYTES) {
    return fromBase64;
  }
  throw new SecretsError('encryption key must be 32 bytes (64 hex chars or base64)');
}

/**
 * Cifra um segredo em texto puro → bundle `iv||tag||ciphertext` (Buffer). IV aleatório por chamada
 * (duas cifras do mesmo texto produzem bundles diferentes). Nunca retorna o texto puro.
 */
export function encryptSecret(plaintext: string, key: Buffer): Buffer {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new SecretsError('plaintext secret is empty');
  }
  if (key.length !== KEY_BYTES) {
    throw new SecretsError(`key must be ${KEY_BYTES} bytes`);
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/**
 * Decifra o bundle `iv||tag||ciphertext`. Lança (GCM) se o conteúdo foi adulterado ou a chave é
 * errada — falha fechada, nunca devolve texto corrompido. Só roda server-side, no instante de uso.
 */
export function decryptSecret(blob: Buffer, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new SecretsError(`key must be ${KEY_BYTES} bytes`);
  }
  if (blob.length < IV_BYTES + TAG_BYTES + 1) {
    throw new SecretsError('ciphertext bundle is too short');
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretsError('decryption failed (tampered ciphertext or wrong key)');
  }
}

/** Últimos 4 caracteres do segredo, para exibir "••••abcd" no front sem revelar o resto. */
export function last4(secret: string): string {
  if (typeof secret !== 'string') return '';
  return secret.length <= 4 ? secret : secret.slice(-4);
}

/** Serializa o bundle para o formato bytea do Postgres/PostgREST (`\x<hex>`), p/ enviar no JSON. */
export function toPgByteaHex(blob: Buffer): string {
  return `\\x${blob.toString('hex')}`;
}

/** Lê o bytea que o PostgREST devolve (`\x<hex>`) de volta para Buffer. Lança se o formato é outro. */
export function fromPgByteaHex(value: string): Buffer {
  if (typeof value !== 'string' || !value.startsWith('\\x')) {
    throw new SecretsError('expected a Postgres bytea hex literal (\\x…)');
  }
  return Buffer.from(value.slice(2), 'hex');
}
