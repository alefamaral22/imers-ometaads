// Theme = the design tokens persisted in `landing_pages.theme` (jsonb). SPEC-000 §6/§10.
// Treated as untrusted data: every field is validated by Zod at the boundary (security rule).
import { z } from 'zod';

// CSS color: hex (#rgb / #rrggbb / #rrggbbaa). We restrict the charset on purpose so the
// serialized theme.css cannot smuggle arbitrary CSS (injection in content = data, not code).
const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'invalid hex color');

// A font-family token: letters, digits, spaces, comma, quotes and hyphen only.
const fontFamily = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w\s,'"-]+$/, 'invalid font-family');

// A length token: number followed by a CSS unit (px/rem/em/%) — no expressions.
const cssLength = z.string().regex(/^\d+(?:\.\d+)?(?:px|rem|em|%)$/, 'invalid CSS length');

export const themeSchema = z
  .object({
    colors: z
      .object({
        primary: hexColor,
        primaryForeground: hexColor,
        secondary: hexColor,
        accent: hexColor,
        background: hexColor,
        foreground: hexColor,
        muted: hexColor,
        border: hexColor,
        success: hexColor,
        destructive: hexColor,
      })
      .strict(),
    fonts: z
      .object({
        heading: fontFamily,
        body: fontFamily,
      })
      .strict(),
    radius: cssLength,
    maxWidth: cssLength,
  })
  .strict();

export type Theme = z.infer<typeof themeSchema>;

// Deterministic default theme — used when a draft has not customized its tokens yet.
// Fonts pair an idiosyncratic display grotesque (Bricolage Grotesque) with a calm humanist body
// (Figtree): a deliberate contrast pairing that avoids the Inter/Fraunces faces now so common they
// read as AI defaults. They are loaded by the template (`<link>` in layout.tsx), so the names here
// must match what the template loads. `muted` is kept dark enough for ≥4.5:1 body contrast on white
// (the most common a11y failure for AI palettes).
export const defaultTheme: Theme = {
  colors: {
    primary: '#4338ca',
    primaryForeground: '#ffffff',
    secondary: '#0f172a',
    accent: '#f97316',
    background: '#ffffff',
    foreground: '#0b1120',
    muted: '#475569',
    border: '#e5e7eb',
    success: '#15803d',
    destructive: '#dc2626',
  },
  fonts: {
    heading: "'Bricolage Grotesque', system-ui, sans-serif",
    body: "'Figtree', system-ui, sans-serif",
  },
  radius: '14px',
  maxWidth: '1140px',
};
