// Onda 8 (cont.) — Linhas snake_case das tabelas de LP (SPEC §6). Conteúdo vive no banco
// (landing_pages.settings/theme + landing_page_sections.fields); criar nasce noindex=true (preview).
// Pura/testável, sem rede.

import type { DraftSection } from '../domain/landing-draft.ts';

export interface LandingPageRow {
  client_id: string;
  product_id: string | null;
  subdomain: string;
  settings: unknown;
  theme: unknown;
  price_cents: number | null;
  checkout_url: string | null;
  cart_state: 'open' | 'closed';
  noindex: true;
  status: 'draft';
  draft_status: 'ready';
}

export interface LandingPageSectionRow {
  landing_page_id: string;
  type: string;
  position: number;
  enabled: boolean;
  fields: unknown;
  version: number;
}

export function buildLandingPageRow(args: {
  clientId: string;
  productId?: string | null;
  subdomain: string;
  settings: unknown;
  theme: unknown;
  priceCents?: number | null;
  checkoutUrl?: string | null;
  cartState?: 'open' | 'closed';
}): LandingPageRow {
  return {
    client_id: args.clientId,
    product_id: args.productId ?? null,
    subdomain: args.subdomain,
    settings: args.settings,
    theme: args.theme,
    price_cents: args.priceCents ?? null,
    checkout_url: args.checkoutUrl ?? null,
    cart_state: args.cartState ?? 'closed',
    noindex: true, // preview sempre nasce noindex; go-live (indexável) é passo manual
    status: 'draft',
    draft_status: 'ready',
  };
}

export function buildSectionRow(
  landingPageId: string,
  section: DraftSection,
): LandingPageSectionRow {
  return {
    landing_page_id: landingPageId,
    type: section.type,
    position: section.position,
    enabled: section.enabled,
    fields: section.fields,
    version: section.version,
  };
}
