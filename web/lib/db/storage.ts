import 'server-only';
import { serverEnv } from '../env';

/**
 * Server-only Supabase Storage client (service_role). Usado para guardar os assets OPCIONAIS que o
 * operador envia para a geração de LP (imagens + manifesto de copy). Mesma chave/segurança do
 * PostgREST client: a chave nunca vai ao browser; todo upload é server-side, após auth+authz.
 * Endpoint Storage = `${SUPABASE_URL}/storage/v1/...`.
 */

function storageBase(): string {
  return `${serverEnv().SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;
}

function authHeaders(): Record<string, string> {
  const key = serverEnv().SUPABASE_SECRET_KEY;
  return { apikey: key, authorization: `Bearer ${key}` };
}

/** Cria o bucket público se ainda não existir (idempotente: 409/conflict é ignorado). */
export async function ensurePublicBucket(bucket: string): Promise<void> {
  const res = await fetch(`${storageBase()}/bucket`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
    cache: 'no-store',
  });
  if (res.ok) return;
  // Já existe → segue. Qualquer outro erro propaga.
  if (res.status === 409) return;
  const detail = await res.text().catch(() => '');
  if (/already exists|duplicate/i.test(detail)) return;
  throw new Error(`Storage ensureBucket ${res.status}: ${detail.slice(0, 200)}`);
}

/** Sobe (upsert) um objeto e devolve sua URL pública. `body` são os bytes; `contentType` o MIME. */
export async function uploadPublicObject(
  bucket: string,
  path: string,
  body: ArrayBuffer | Uint8Array | string,
  contentType: string,
): Promise<string> {
  const res = await fetch(`${storageBase()}/object/${bucket}/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': contentType, 'x-upsert': 'true' },
    body: body as BodyInit,
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Storage upload ${res.status} on ${path}: ${detail.slice(0, 200)}`);
  }
  return publicObjectUrl(bucket, path);
}

/** URL pública de um objeto num bucket público. */
export function publicObjectUrl(bucket: string, path: string): string {
  return `${storageBase()}/object/public/${bucket}/${encodeStoragePath(path)}`;
}

// Codifica cada segmento do path (preserva as barras) para uma URL de Storage válida.
function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}
