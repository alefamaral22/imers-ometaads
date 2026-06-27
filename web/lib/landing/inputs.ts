/**
 * Inputs OPCIONAIS do operador para a geração de uma landing page: imagens enviadas e/ou copy
 * escrita à mão. São DADO, não instrução (anti prompt-injection): tudo validado por schema na
 * fronteira, com tamanho/charset/MIME limitados. Vivem no Storage (bucket `lp-uploads`) sob um
 * `inputs_token` (UUID) — o job carrega só o token (charset-safe), a skill headless lê o manifesto.
 * Módulo PURO (sem I/O): a fronteira HTTP e o upload ficam em services/landing-inputs.ts.
 */

import { z } from 'zod';

// Bucket público de assets de LP enviados pelo operador. Criado on-demand pelo service.
export const LP_INPUTS_BUCKET = 'lp-uploads';

// Limites de upload (defesa em profundidade — o endpoint também valida).
export const MAX_IMAGES = 8;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB por imagem

// MIME → extensão de arquivo. Só rasters web comuns; sem SVG (vetor = superfície de XSS).
export const ALLOWED_IMAGE_MIME: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Copy opcional escrita pelo operador. Campos ausentes = a IA gera (comportamento atual). */
export const landingInputsCopySchema = z
  .object({
    headline: z.string().trim().min(1).max(160).optional(),
    subheadline: z.string().trim().min(1).max(400).optional(),
    ctaLabel: z.string().trim().min(1).max(80).optional(),
    // Orientação livre para o copywriter (tom, bullets, oferta). Não vira copy crua sozinha.
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type LandingInputsCopy = z.infer<typeof landingInputsCopySchema>;

// Uma imagem já armazenada (URL pública + nome original sanitizado, só para referência humana).
export const manifestImageSchema = z
  .object({ url: z.string().url(), name: z.string().max(200) })
  .strict();

export type ManifestImage = z.infer<typeof manifestImageSchema>;

/** Manifesto lido pela skill headless. `copy`/`images` ausentes ou vazios = nada a aplicar. */
export const landingInputsManifestSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string(),
    copy: landingInputsCopySchema.optional(),
    images: z.array(manifestImageSchema).max(MAX_IMAGES),
  })
  .strict();

export type LandingInputsManifest = z.infer<typeof landingInputsManifestSchema>;

/** Normaliza a copy: remove chaves vazias; retorna undefined se nada sobrou (nada a aplicar). */
export function normalizeCopy(copy: LandingInputsCopy | undefined): LandingInputsCopy | undefined {
  if (!copy) return undefined;
  const entries = Object.entries(copy).filter(([, v]) => typeof v === 'string' && v.length > 0);
  return entries.length > 0 ? (Object.fromEntries(entries) as LandingInputsCopy) : undefined;
}

/** Monta o manifesto determinístico a partir da copy normalizada e das imagens já armazenadas. */
export function buildInputsManifest(
  copy: LandingInputsCopy | undefined,
  images: readonly ManifestImage[],
  now: string,
): LandingInputsManifest {
  const normalized = normalizeCopy(copy);
  return {
    version: 1,
    createdAt: now,
    ...(normalized !== undefined && { copy: normalized }),
    images: [...images],
  };
}

/** Caminho no bucket para o manifesto de um token. */
export function manifestPath(inputsToken: string): string {
  return `${inputsToken}/manifest.json`;
}

/** Caminho no bucket para a i-ésima imagem (extensão derivada do MIME validado). */
export function imagePath(inputsToken: string, index: number, ext: string): string {
  return `${inputsToken}/img-${index}.${ext}`;
}

// Sanitiza o nome original do arquivo para exibição/log (sem path, charset estreito, bounded).
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'arquivo';
  return base.replace(/[^\w.\- ]+/g, '_').slice(0, 200) || 'arquivo';
}
