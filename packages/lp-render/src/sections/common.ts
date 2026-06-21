// Shared field primitives for section schemas. All copy is untrusted content: bounded length,
// validated by Zod, and later HTML-escaped by the serializer (content = data, not instruction).
import { z } from 'zod';
import { httpsUrlSchema } from '../settings/settings.js';

// Bounded plain text (no markup expectations; serializer escapes on output).
export const text = (max = 280) => z.string().min(1).max(max);
export const optionalText = (max = 280) => z.string().max(max).optional();

// A rich-but-bounded paragraph.
export const richText = (max = 2000) => z.string().min(1).max(max);

// Asset path/URL: either an https URL or a landing-assets-relative path ("/assets/foo.webp").
export const assetRef = z.union([
  httpsUrlSchema,
  z.string().regex(/^\/[\w\-./]+$/, 'invalid asset path'),
]);

// A call-to-action button: label + an action. Action "checkout" routes through lib/checkout.
export const cta = z
  .object({
    label: text(80),
    // "checkout" => resolved against settings.checkoutUrl at runtime; "url" => explicit href.
    action: z.enum(['checkout', 'url', 'anchor']),
    href: z.union([httpsUrlSchema, z.string().regex(/^#[\w-]+$/)]).optional(),
  })
  .strict();

export type Cta = z.infer<typeof cta>;

// An icon token from a fixed allowlist (keeps the template's icon set closed/typed).
export const icon = z.enum([
  'check',
  'star',
  'shield',
  'bolt',
  'heart',
  'clock',
  'gift',
  'trophy',
  'lock',
  'sparkles',
]);

export type IconName = z.infer<typeof icon>;
