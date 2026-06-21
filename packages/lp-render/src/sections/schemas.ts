// The 17 landing-page section types. Each entry maps a section `type` (mirrors
// `landing_page_sections.type`) to a strict Zod schema for its `fields` jsonb column.
// Adding/removing a section here is the single source of truth for the section catalog.
import { z } from 'zod';
import { text, optionalText, richText, assetRef, cta, icon } from './common.js';

// 1) hero — above-the-fold headline + primary CTA.
export const heroFields = z
  .object({
    eyebrow: optionalText(120),
    headline: text(160),
    subheadline: optionalText(400),
    cta: cta,
    secondaryCta: cta.optional(),
    image: assetRef.optional(),
  })
  .strict();

// 2) logos — social-proof logo strip ("as seen on").
export const logosFields = z
  .object({
    title: optionalText(160),
    logos: z
      .array(z.object({ alt: text(120), src: assetRef }).strict())
      .min(1)
      .max(20),
  })
  .strict();

// 3) problem — agitate the pain the offer solves.
export const problemFields = z
  .object({
    headline: text(160),
    items: z
      .array(z.object({ icon: icon.optional(), text: text(280) }).strict())
      .min(1)
      .max(12),
  })
  .strict();

// 4) solution — reframe toward the offer.
export const solutionFields = z
  .object({
    headline: text(160),
    body: richText(2000),
    image: assetRef.optional(),
  })
  .strict();

// 5) features — what the product includes.
export const featuresFields = z
  .object({
    headline: text(160),
    features: z
      .array(z.object({ icon: icon.optional(), title: text(120), description: text(400) }).strict())
      .min(1)
      .max(24),
  })
  .strict();

// 6) benefits — outcomes for the buyer (distinct from raw features).
export const benefitsFields = z
  .object({
    headline: text(160),
    benefits: z
      .array(z.object({ icon: icon.optional(), text: text(280) }).strict())
      .min(1)
      .max(24),
  })
  .strict();

// 7) how_it_works — ordered steps.
export const howItWorksFields = z
  .object({
    headline: text(160),
    steps: z
      .array(z.object({ title: text(120), description: text(400) }).strict())
      .min(1)
      .max(10),
  })
  .strict();

// 8) testimonials — customer quotes.
export const testimonialsFields = z
  .object({
    headline: optionalText(160),
    testimonials: z
      .array(
        z
          .object({
            quote: text(600),
            author: text(120),
            role: optionalText(120),
            avatar: assetRef.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

// 9) video — embedded VSL/demo (https embed url only).
export const videoFields = z
  .object({
    headline: optionalText(160),
    embedUrl: assetRef,
    poster: assetRef.optional(),
  })
  .strict();

// 10) pricing — one or more plans.
export const pricingFields = z
  .object({
    headline: text(160),
    plans: z
      .array(
        z
          .object({
            name: text(80),
            priceCents: z.number().int().nonnegative(),
            period: optionalText(40),
            features: z.array(text(200)).max(20),
            cta: cta,
            highlighted: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();

// 11) offer — the stacked-value offer + price anchor + CTA.
export const offerFields = z
  .object({
    headline: text(200),
    valueItems: z
      .array(z.object({ label: text(160), valueCents: z.number().int().nonnegative() }).strict())
      .min(1)
      .max(20),
    anchorPriceCents: z.number().int().nonnegative().optional(),
    priceCents: z.number().int().nonnegative(),
    cta: cta,
  })
  .strict();

// 12) faq — accordion questions.
export const faqFields = z
  .object({
    headline: optionalText(160),
    items: z
      .array(z.object({ question: text(280), answer: richText(2000) }).strict())
      .min(1)
      .max(40),
  })
  .strict();

// 13) guarantee — risk reversal.
export const guaranteeFields = z
  .object({
    headline: text(160),
    body: richText(1200),
    badge: assetRef.optional(),
  })
  .strict();

// 14) about — authority/credibility of the author/brand.
export const aboutFields = z
  .object({
    headline: text(160),
    body: richText(2000),
    image: assetRef.optional(),
  })
  .strict();

// 15) lead_form — capture form (fields are flags; the Worker mirrors NO-PII to lp_events).
export const leadFormFields = z
  .object({
    headline: text(160),
    submitLabel: text(80),
    collectEmail: z.boolean(),
    collectPhone: z.boolean(),
    consentText: optionalText(400),
  })
  .strict();

// 16) urgency — scarcity/deadline banner (deadline is rendered client-side from a duration).
export const urgencyFields = z
  .object({
    headline: text(200),
    // Countdown duration in seconds from first view; client-side only, no server clock.
    countdownSeconds: z
      .number()
      .int()
      .positive()
      .max(60 * 60 * 24 * 30)
      .optional(),
    note: optionalText(280),
  })
  .strict();

// 17) footer — legal links + copyright. Neutral cookie/storage prefix handled in lib/consent.
export const footerFields = z
  .object({
    copyright: text(200),
    links: z
      .array(z.object({ label: text(80), href: assetRef }).strict())
      .max(20)
      .optional(),
  })
  .strict();

// The closed catalog of section type -> fields schema. Order defines the canonical default order.
export const SECTION_FIELD_SCHEMAS = {
  hero: heroFields,
  logos: logosFields,
  problem: problemFields,
  solution: solutionFields,
  features: featuresFields,
  benefits: benefitsFields,
  how_it_works: howItWorksFields,
  testimonials: testimonialsFields,
  video: videoFields,
  pricing: pricingFields,
  offer: offerFields,
  faq: faqFields,
  guarantee: guaranteeFields,
  about: aboutFields,
  lead_form: leadFormFields,
  urgency: urgencyFields,
  footer: footerFields,
} as const;

export type SectionType = keyof typeof SECTION_FIELD_SCHEMAS;

// Canonical ordering of section types (fixed tuple; defines the default top-to-bottom order and
// is used to break ties when two sections share a `position`). SPEC-000 §8 Onda 8 — 17 sections.
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
] as const satisfies readonly SectionType[];

// Compile-time guard: the catalog must declare exactly 17 sections.
type AssertLength<T extends readonly unknown[], N extends number> = T['length'] extends N
  ? true
  : never;
const _seventeenSections: AssertLength<typeof SECTION_TYPES, 17> = true;
void _seventeenSections;
