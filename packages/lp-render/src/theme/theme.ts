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
export const defaultTheme: Theme = {
  colors: {
    primary: '#2563eb',
    primaryForeground: '#ffffff',
    secondary: '#1e293b',
    accent: '#f59e0b',
    background: '#ffffff',
    foreground: '#0f172a',
    muted: '#64748b',
    border: '#e2e8f0',
    success: '#16a34a',
    destructive: '#dc2626',
  },
  fonts: {
    heading: "'Inter', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
  },
  radius: '12px',
  maxWidth: '1200px',
};
