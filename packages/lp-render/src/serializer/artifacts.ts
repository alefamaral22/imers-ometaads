// Shape of the build artifacts the serializer emits. These are the contract consumed by the
// landing-pages/_template static-export app.

import type { SectionType } from '../sections/schemas.js';

// content-spec.json — the structural spec: page settings + the ordered, enabled sections.
// Each section keeps its full validated `fields` (the template renders from this directly).
export interface ContentSpec {
  // Schema version of the artifact format (bump on breaking changes to the contract).
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

export interface ContentSpecSection {
  type: SectionType;
  position: number;
  // Stable per-section key ("hero", "features", ...) used to index into messages/pt.json.
  key: SectionType;
  // The validated fields for this section (copy + structure together).
  fields: unknown;
}

// messages/pt.json — flat i18n bag. Keys are "<sectionKey>.<path>" extracted from string fields.
export type Messages = Record<string, string>;
