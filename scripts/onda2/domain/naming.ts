// Onda 2 — Nomes e chaves naturais determinísticos (idempotência: re-run não duplica).
// A chave natural é estável por (cliente, produto, stamp) → re-rodar com o mesmo stamp faz upsert.

import type { CopyAngle } from './angles.ts';

/** Stamp determinístico para um instante (UTC, sem caracteres inválidos em nome de arquivo). */
export function stampFromDate(date: Date): string {
  // Formato YYYYMMDDTHHmmss (ex.: 20260620T154233). Injetável: o chamador passa o relógio.
  const iso = date.toISOString(); // 2026-06-20T15:42:33.000Z
  return iso.slice(0, 19).replace(/[-:]/g, '').replace('T', 'T');
}

export function campaignName(clientSlug: string, productSlug: string, stamp: string): string {
  return `${clientSlug} · traffic · ${productSlug} · ${stamp}`;
}

export function adSetName(clientSlug: string, productSlug: string, stamp: string): string {
  return `${clientSlug} · traffic · ${productSlug} · adset · ${stamp}`;
}

export function adName(productSlug: string, angle: CopyAngle, stamp: string): string {
  return `${productSlug} · ${angle} · ${stamp}`;
}

export function creativeName(productSlug: string, angle: CopyAngle, stamp: string): string {
  return `${productSlug} · ${angle} · creative · ${stamp}`;
}

/** Caminho do arquivo de imagem no bucket público ad-ingest (a Meta busca a imagem aqui). */
export function imageStoragePath(
  clientSlug: string,
  productSlug: string,
  angle: CopyAngle,
  stamp: string,
): string {
  return `${clientSlug}/${productSlug}/${stamp}/${angle}.png`;
}

/** Nome do manifest da tentativa (SPEC §10): <stamp>-<tipo>.json. */
export function manifestFileName(stamp: string, kind = 'traffic'): string {
  return `${stamp}-${kind}.json`;
}
