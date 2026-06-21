// ContentDoc = { settings, theme, sections[] } — the canonical landing-page content contract
// (SPEC-000 §10). It is assembled from `landing_pages.settings/theme` + `landing_page_sections`
// and is the only input the serializer consumes. Validated by Zod (untrusted content boundary).
import { z } from 'zod';
import { settingsSchema } from './settings/settings.js';
import { themeSchema } from './theme/theme.js';
import { sectionSchema } from './sections/section.js';

export const contentDocSchema = z
  .object({
    settings: settingsSchema,
    theme: themeSchema,
    // At least one section (a real LP always has a hero). Section `type` is unique per page in the
    // DB (unique(landing_page_id, type)); we re-assert uniqueness here as a render-time invariant.
    sections: z
      .array(sectionSchema)
      .min(1)
      .superRefine((sections, ctx) => {
        const seen = new Set<string>();
        for (const [i, s] of sections.entries()) {
          if (seen.has(s.type)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `duplicate section type: ${s.type}`,
              path: [i, 'type'],
            });
          }
          seen.add(s.type);
        }
      }),
  })
  .strict();

export type ContentDoc = z.infer<typeof contentDocSchema>;

// Parse + validate untrusted input into a typed ContentDoc. Throws ZodError on invalid input.
export function parseContentDoc(input: unknown): ContentDoc {
  return contentDocSchema.parse(input);
}
