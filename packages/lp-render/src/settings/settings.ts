// Settings = the page-level config persisted in `landing_pages.settings` (jsonb), plus the
// tracking block from `landing_pages.tracking`. Money stays in integer cents (SPEC §6/§11).
// cart_state mirrors the `public.cart_state` enum; noindex defaults true on create (preview).
import { z } from 'zod';

// A subdomain label: lowercase alnum + hyphen, no leading/trailing hyphen (RFC 1123-ish).
export const subdomainSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'invalid subdomain label');

// We only allow https URLs for outbound links (checkout/affiliate). No data:/javascript: schemes.
export const httpsUrlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be an https URL');

export const cartStateSchema = z.enum(['open', 'closed']); // mirrors public.cart_state

// UTM defaults baked into the page; runtime UTMs from the URL win over these (see lib/utm).
const utmDefaultsSchema = z
  .object({
    source: z.string().max(120).optional(),
    medium: z.string().max(120).optional(),
    campaign: z.string().max(120).optional(),
    term: z.string().max(120).optional(),
    content: z.string().max(120).optional(),
  })
  .strict();

// Tracking config (mirror of `landing_pages.tracking`). Endpoint is the server-side Worker (/e).
const trackingSchema = z
  .object({
    // Tracking endpoint — defaults to the neutral-prefixed server-side collector.
    endpoint: httpsUrlSchema.optional(),
    metaPixelId: z
      .string()
      .regex(/^\d{6,20}$/, 'invalid Meta pixel id')
      .optional(),
    ga4MeasurementId: z
      .string()
      .regex(/^G-[A-Z0-9]{6,12}$/, 'invalid GA4 measurement id')
      .optional(),
    googleAdsConversionId: z
      .string()
      .regex(/^AW-\d{6,20}$/, 'invalid Google Ads conversion id')
      .optional(),
  })
  .strict();

export const settingsSchema = z
  .object({
    // The page's own subdomain (e.g. "curso-exemplo" => curso-exemplo.example.com).
    subdomain: subdomainSchema,
    // Browser-facing locale of the rendered copy. Onda 8 ships pt only.
    locale: z.literal('pt'),
    // Search-engine indexing. Create nasce noindex=true (preview); go-live is a manual step.
    noindex: z.boolean(),
    // Checkout destination (external). Money lives in cents elsewhere.
    checkoutUrl: httpsUrlSchema.optional(),
    priceCents: z.number().int().nonnegative().optional(),
    currency: z.string().length(3).optional(), // ISO 4217, e.g. "BRL"
    cartState: cartStateSchema,
    // Affiliate program toggle: when true, ?ref=<code> is appended to checkout links.
    affiliateEnabled: z.boolean(),
    // Consent banner (LGPD/GDPR) toggle. When true, tracking waits for consent (see lib/consent).
    consentRequired: z.boolean(),
    utmDefaults: utmDefaultsSchema.optional(),
    tracking: trackingSchema.optional(),
  })
  .strict();

export type Settings = z.infer<typeof settingsSchema>;

// Deterministic defaults for a freshly created draft (preview, noindex, cart closed).
export const defaultSettings: Settings = {
  subdomain: 'example',
  locale: 'pt',
  noindex: true,
  cartState: 'closed',
  affiliateEnabled: false,
  consentRequired: true,
};
