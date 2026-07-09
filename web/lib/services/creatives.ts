import 'server-only';
import { randomUUID } from 'node:crypto';
import { selectRows, insertRows, patchRows } from '../db/client';
import { uploadPublicObject } from '../db/storage';
import { generateImage, type ReferenceImageInput } from './image-generation';
import {
  creativeRowSchema,
  parseRows,
  CREATIVE_COLUMNS,
  type CreativeRow,
} from '../domain/schemas';
import { clientScopeFilter, type AccountScope } from '../multitenant/scope';
import { accountClientIds } from './clients';

/**
 * Server-side CRUD de public.creatives. Escopado por account via client_id (tabela filha). O
 * super_admin/socio vê todos; cliente_usuario só vê criativos dos SEUS clientes.
 */

export async function listCreatives(
  scope: AccountScope,
  filters?: { clientId?: string; status?: string },
): Promise<CreativeRow[]> {
  const filter = clientScopeFilter(await accountClientIds(scope));
  if (filter.kind === 'none') return [];

  const eq: Record<string, string> = {};
  if (filters?.clientId) eq.client_id = filters.clientId;
  if (filters?.status) eq.status = filters.status;

  const rows = await selectRows('creatives', {
    select: CREATIVE_COLUMNS,
    order: 'created_at.desc',
    ...(Object.keys(eq).length > 0 ? { eq } : {}),
    ...(filter.kind === 'in' && !filters?.clientId ? { in: { client_id: filter.clientIds } } : {}),
  });
  return parseRows(creativeRowSchema, rows);
}

export async function getCreativeById(id: string): Promise<CreativeRow | null> {
  const rows = await selectRows('creatives', {
    select: CREATIVE_COLUMNS,
    eq: { id },
    limit: 1,
  });
  return parseRows(creativeRowSchema, rows)[0] ?? null;
}

export interface CreateCreativeInput {
  accountId: string;
  clientId: string;
  name: string;
  headline?: string | null | undefined;
  primaryText?: string | null | undefined;
  description?: string | null | undefined;
  callToActionType?: string | null | undefined;
  linkUrl?: string | null | undefined;
  imageUrl?: string | null | undefined;
  generatedImageId?: string | null | undefined;
  status?: string | undefined;
  source?: string | undefined;
  prompt?: string | null | undefined;
}

async function storeGeneratedImage(input: {
  accountId: string;
  clientId: string;
  prompt: string;
  base64: string;
  width: number;
  height: number;
  model: string;
  aspect: string;
}): Promise<{ id: string; url: string }> {
  const bytes = Buffer.from(input.base64, 'base64');
  const path = `creatives/${input.clientId}/${randomUUID()}.png`;
  const url = await uploadPublicObject('ad-ingest', path, bytes, 'image/png');

  const inserted = await insertRows('generated_images', [
    {
      account_id: input.accountId,
      client_id: input.clientId,
      storage_bucket: 'ad-ingest',
      storage_path: path,
      width: input.width,
      height: input.height,
      model: input.model,
      prompt: input.prompt,
      aspect: input.aspect,
      raw_spec: { source: 'openai' },
    },
  ]);
  const row = inserted[0] as { id?: string } | undefined;
  if (!row?.id) throw new Error('insert generated_images returned no row');
  return { id: row.id, url };
}

export async function createCreative(input: CreateCreativeInput): Promise<CreativeRow> {
  const row = {
    account_id: input.accountId,
    client_id: input.clientId,
    name: input.name,
    headline: input.headline ?? null,
    primary_text: input.primaryText ?? null,
    description: input.description ?? null,
    call_to_action_type: input.callToActionType ?? null,
    link_url: input.linkUrl ?? null,
    image_url: input.imageUrl ?? null,
    generated_image_id: input.generatedImageId ?? null,
    status: input.status ?? 'draft',
    source: input.source ?? 'manual',
    prompt: input.prompt ?? null,
  };
  const inserted = await insertRows('creatives', [row]);
  const parsed = parseRows(creativeRowSchema, inserted);
  const first = parsed[0];
  if (!first) throw new Error('insert creatives returned no row');
  return first;
}

export interface UpdateCreativeInput {
  name?: string | undefined;
  headline?: string | null | undefined;
  primaryText?: string | null | undefined;
  description?: string | null | undefined;
  callToActionType?: string | null | undefined;
  linkUrl?: string | null | undefined;
  imageUrl?: string | null | undefined;
  generatedImageId?: string | null | undefined;
  status?: string | undefined;
  feedback?: string | null | undefined;
  reviewedBy?: string | null | undefined;
}

export async function updateCreative(id: string, input: UpdateCreativeInput): Promise<CreativeRow> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.headline !== undefined) patch.headline = input.headline;
  if (input.primaryText !== undefined) patch.primary_text = input.primaryText;
  if (input.description !== undefined) patch.description = input.description;
  if (input.callToActionType !== undefined) patch.call_to_action_type = input.callToActionType;
  if (input.linkUrl !== undefined) patch.link_url = input.linkUrl;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.generatedImageId !== undefined) patch.generated_image_id = input.generatedImageId;
  if (input.status !== undefined) patch.status = input.status;
  if (input.feedback !== undefined) patch.feedback = input.feedback;
  if (input.reviewedBy !== undefined) {
    patch.reviewed_by = input.reviewedBy;
    patch.reviewed_at = new Date().toISOString();
  }

  const updated = await patchRows('creatives', { id }, patch);
  const parsed = parseRows(creativeRowSchema, updated);
  const first = parsed[0];
  if (!first) throw new Error('patch creatives returned no row');
  return first;
}

/** Aprova um criativo — muda status e registra quem aprovou. */
export async function approveCreative(id: string, reviewerId: string): Promise<CreativeRow> {
  return updateCreative(id, { status: 'approved', reviewedBy: reviewerId });
}

/** Rejeita um criativo — muda status, registra quem e opcionalmente o motivo. */
export async function rejectCreative(
  id: string,
  reviewerId: string,
  feedback?: string,
): Promise<CreativeRow> {
  return updateCreative(id, {
    status: 'rejected',
    reviewedBy: reviewerId,
    ...(feedback !== undefined ? { feedback } : {}),
  });
}

/** Gera imagem via DALL-E, armazena no bucket ad-ingest e cria o criativo com status pending_approval. */
export interface GenerateCreativeInput {
  accountId: string;
  clientId: string;
  prompt: string;
  name: string;
  categoryId?: string | undefined;
  referenceImages?: ReferenceImageInput[] | undefined;
  headline?: string | null | undefined;
  primaryText?: string | null | undefined;
  description?: string | null | undefined;
  callToActionType?: string | null | undefined;
  linkUrl?: string | null | undefined;
  size?: '1024x1024' | '1536x1024' | '1024x1536' | undefined;
  quality?: 'low' | 'medium' | 'high' | undefined;
}

export async function generateCreativeImage(input: GenerateCreativeInput): Promise<CreativeRow> {
  const img = await generateImage({
    accountId: input.accountId,
    prompt: input.prompt,
    categoryId: input.categoryId,
    referenceImages: input.referenceImages,
    size: input.size,
    quality: input.quality,
  });

  const stored = await storeGeneratedImage({
    accountId: input.accountId,
    clientId: input.clientId,
    prompt: img.revisedPrompt,
    base64: img.base64,
    width: img.width,
    height: img.height,
    model: img.model,
    aspect: input.size ?? '1024x1024',
  });

  return createCreative({
    accountId: input.accountId,
    clientId: input.clientId,
    name: input.name,
    headline: input.headline,
    primaryText: input.primaryText,
    description: input.description,
    callToActionType: input.callToActionType,
    linkUrl: input.linkUrl,
    imageUrl: stored.url,
    generatedImageId: stored.id,
    status: 'pending_approval',
    source: 'ai',
    prompt: img.revisedPrompt,
  });
}
