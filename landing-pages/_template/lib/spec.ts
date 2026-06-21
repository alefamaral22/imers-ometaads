// The artifact contract this template consumes. Mirrors @template/lp-render's
// serializer/artifacts.ts — the template depends on the *artifact format*, not on the
// package runtime (decoupled build: a published LP is just static files + generated/).
// SPEC-000 §8 Onda 8 / §10.

export const SECTION_TYPES = [
  'hero',
  'logos',
  'problem',
  'solution',
  'features',
  'benefits',
  'how_it_works',
  'testimonials',
  'video',
  'pricing',
  'offer',
  'faq',
  'guarantee',
  'about',
  'lead_form',
  'urgency',
  'footer',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export interface ContentSpecSection {
  type: SectionType;
  position: number;
  key: SectionType;
  fields: unknown;
}

export interface ContentSpec {
  version: 1;
  settings: {
    subdomain: string;
    locale: 'pt';
    noindex: boolean;
    cartState: 'open' | 'closed';
    affiliateEnabled: boolean;
    consentRequired: boolean;
    checkoutUrl?: string;
    priceCents?: number;
    currency?: string;
    utmDefaults?: Record<string, string>;
    tracking?: Record<string, string>;
  };
  sections: ContentSpecSection[];
}

// Build-time import of the serializer output. `publish-landing-page-<cliente>` regenerates
// generated/ from Supabase before `next build`; this checked-in sample lets the template build
// standalone (acceptance: `next build` green).
import generated from '../generated/content-spec.json';

export const contentSpec = generated as unknown as ContentSpec;

// Format integer cents to a localized currency string (pt-BR). Money is always integer cents.
export function formatCents(cents: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}
