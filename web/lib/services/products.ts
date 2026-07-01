import 'server-only';
import { selectRows, insertRows } from '../db/client';
import {
  productRowSchema,
  parseRows,
  PRODUCT_DISPLAY_COLUMNS,
  type ProductRow,
} from '../domain/schemas';
import { writeOperationLog } from './logs';
import type { CreateProductRequest } from '../multitenant/requests';

/**
 * Server-side reads/writes of public.products. O `brief` (jsonb) é o contrato lido pela skill de LP
 * (validado por parseProductBrief no runner). RLS fechada ao browser (ADR 0002); toda query aqui.
 */
export async function listProducts(clientId: string): Promise<ProductRow[]> {
  const rows = await selectRows('products', {
    select: PRODUCT_DISPLAY_COLUMNS,
    eq: { client_id: clientId },
    order: 'name.asc',
  });
  return parseRows(productRowSchema, rows);
}

/**
 * Cria um produto (brief) de um cliente pela UI. O brief jsonb espelha o formato do ProductBrief lido
 * pelo runner (slug/name/audience/valueProps/tone/landingUrl/priceCents/currency/defaultSubdomain?).
 * slug duplicado por cliente vira erro do PostgREST (unique). Audita a criação.
 */
export async function createProduct(
  actorSlug: string,
  input: CreateProductRequest,
): Promise<ProductRow> {
  const brief = {
    slug: input.slug,
    name: input.name,
    audience: input.audience,
    valueProps: input.valueProps,
    tone: input.tone,
    landingUrl: input.landingUrl,
    priceCents: input.priceCents,
    currency: input.currency,
    ...(input.defaultSubdomain !== undefined && { defaultSubdomain: input.defaultSubdomain }),
  };
  const row = {
    client_id: input.clientId,
    slug: input.slug,
    name: input.name,
    brief,
    status: 'ready',
    ...(input.defaultSubdomain !== undefined && { default_subdomain: input.defaultSubdomain }),
  };
  const inserted = await insertRows('products', [row]);
  const product = parseRows(productRowSchema, inserted)[0];
  if (!product) throw new Error('insert products returned no row');
  await writeOperationLog({
    entityType: 'product',
    entityId: product.id,
    clientId: input.clientId,
    action: 'create',
    actor: actorSlug,
    summary: `produto ${product.slug} cadastrado`,
  }).catch(() => {});
  return product;
}
