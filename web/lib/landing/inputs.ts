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

// Só https para links de saída (checkout/site/WhatsApp). Nunca data:/javascript: (XSS).
const httpsUrl = z.string().url().refine((u) => u.startsWith('https://'), 'must be an https URL');

/**
 * Destino do botão de CTA escolhido no wizard. `kind` diz como a skill liga o href:
 * `checkout` → `settings.checkoutUrl` (CTAs usam `action:'checkout'`); `whatsapp`/`url` → CTA
 * `action:'url'` com este href. O href já chega normalizado e validado (https).
 */
export const landingInputsCtaSchema = z
  .object({
    kind: z.enum(['whatsapp', 'url', 'checkout']),
    href: httpsUrl,
  })
  .strict();

export type LandingInputsCta = z.infer<typeof landingInputsCtaSchema>;

/**
 * Contexto do produto coletado pelo wizard (Etapa 2). Tudo opcional — campos ausentes a IA decide.
 * É DADO, não instrução: serve de orientação ao architect/copywriter e de valores para settings.
 */
export const landingInputsContextSchema = z
  .object({
    productName: z.string().trim().min(1).max(200).optional(),
    whatItSolves: z.string().trim().min(1).max(2000).optional(),
    // Preço a exibir, em centavos (SPEC: dinheiro sempre inteiro de centavos). Teto sanitário R$1M.
    priceCents: z.number().int().nonnegative().max(100_000_000).optional(),
    offer: z.string().trim().min(1).max(500).optional(),
    cta: landingInputsCtaSchema.optional(),
  })
  .strict();

export type LandingInputsContext = z.infer<typeof landingInputsContextSchema>;

// Uma imagem já armazenada (URL pública + nome original sanitizado, só para referência humana).
export const manifestImageSchema = z
  .object({ url: z.string().url(), name: z.string().max(200) })
  .strict();

export type ManifestImage = z.infer<typeof manifestImageSchema>;

/** Manifesto lido pela skill headless. `copy`/`context`/`images` ausentes ou vazios = nada a aplicar. */
export const landingInputsManifestSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string(),
    copy: landingInputsCopySchema.optional(),
    context: landingInputsContextSchema.optional(),
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

/** Normaliza o contexto: remove chaves ausentes/vazias; undefined se nada sobrou (nada a aplicar). */
export function normalizeContext(
  context: LandingInputsContext | undefined,
): LandingInputsContext | undefined {
  if (!context) return undefined;
  const entries = Object.entries(context).filter(([, v]) => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return v.length > 0;
    return true; // number (priceCents) ou objeto (cta) já validados pelo schema
  });
  return entries.length > 0 ? (Object.fromEntries(entries) as LandingInputsContext) : undefined;
}

/**
 * Monta a URL https do WhatsApp (`wa.me`) a partir de um número livre. Retorna null se, depois de
 * tirar tudo que não é dígito, sobrar algo fora de 8–15 dígitos (faixa E.164). Não assume DDI.
 */
export function whatsappHref(raw: string): string | null {
  const digits = raw.replace(/\D+/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}

/** Monta o manifesto determinístico a partir da copy/contexto normalizados e das imagens. */
export function buildInputsManifest(
  copy: LandingInputsCopy | undefined,
  context: LandingInputsContext | undefined,
  images: readonly ManifestImage[],
  now: string,
): LandingInputsManifest {
  const normalizedCopy = normalizeCopy(copy);
  const normalizedContext = normalizeContext(context);
  return {
    version: 1,
    createdAt: now,
    ...(normalizedCopy !== undefined && { copy: normalizedCopy }),
    ...(normalizedContext !== undefined && { context: normalizedContext }),
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
