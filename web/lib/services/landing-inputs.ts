import 'server-only';
import {
  LP_INPUTS_BUCKET,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_MIME,
  buildInputsManifest,
  imagePath,
  manifestPath,
  safeFileName,
  type LandingInputsCopy,
  type LandingInputsContext,
  type ManifestImage,
} from '../landing/inputs';
import { ensurePublicBucket, uploadPublicObject } from '../db/storage';

export interface StoreInputsResult {
  inputsToken: string;
  imageUrls: string[];
}

export interface RejectedInput {
  rejected: true;
  reason: 'too_many_images' | 'unsupported_type' | 'image_too_large';
}

export type StoreInputsOutcome = StoreInputsResult | RejectedInput;

/**
 * Guarda os inputs OPCIONAIS do operador (imagens + copy) no Storage sob um `inputs_token` novo e
 * grava o manifesto que a skill headless vai ler. Validação defensiva (quantidade/MIME/tamanho) —
 * entrada externa é dado, não instrução. Não escreve nada se não houver imagem nem copy.
 */
export async function storeLandingInputs(input: {
  images: readonly Blob[];
  copy: LandingInputsCopy | undefined;
  context: LandingInputsContext | undefined;
}): Promise<StoreInputsOutcome> {
  const { images, copy, context } = input;

  if (images.length > MAX_IMAGES) return { rejected: true, reason: 'too_many_images' };
  for (const img of images) {
    const ext = ALLOWED_IMAGE_MIME[img.type];
    if (ext === undefined) return { rejected: true, reason: 'unsupported_type' };
    if (img.size > MAX_IMAGE_BYTES) return { rejected: true, reason: 'image_too_large' };
  }

  const inputsToken = globalThis.crypto.randomUUID();

  if (images.length > 0) await ensurePublicBucket(LP_INPUTS_BUCKET);

  const stored: ManifestImage[] = [];
  const imageUrls: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i] as Blob & { name?: string };
    const ext = ALLOWED_IMAGE_MIME[img.type] as string;
    const bytes = await img.arrayBuffer();
    const path = imagePath(inputsToken, i, ext);
    const url = await uploadPublicObject(LP_INPUTS_BUCKET, path, bytes, img.type);
    const name = safeFileName(typeof img.name === 'string' ? img.name : `img-${i}.${ext}`);
    stored.push({ url, name });
    imageUrls.push(url);
  }

  const manifest = buildInputsManifest(copy, context, stored, new Date().toISOString());
  // Garante o bucket mesmo quando só há copy (sem imagens).
  if (images.length === 0) await ensurePublicBucket(LP_INPUTS_BUCKET);
  await uploadPublicObject(
    LP_INPUTS_BUCKET,
    manifestPath(inputsToken),
    JSON.stringify(manifest, null, 2),
    'application/json',
  );

  return { inputsToken, imageUrls };
}
