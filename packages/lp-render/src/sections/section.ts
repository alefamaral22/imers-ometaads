// A persisted section row (mirror of `landing_page_sections`): type + position + enabled +
// version + the per-type validated `fields`. The union is discriminated on `type`, so each
// section's fields are validated by exactly its own schema (security: schema at the boundary).
import { z } from 'zod';
import { SECTION_FIELD_SCHEMAS, type SectionType } from './schemas.js';

// Build one discriminated-union member per section type from the field-schema catalog.
const sectionMembers = (Object.keys(SECTION_FIELD_SCHEMAS) as SectionType[]).map((type) =>
  z
    .object({
      type: z.literal(type),
      // Display order within the page (mirrors landing_page_sections.position).
      position: z.number().int().nonnegative(),
      // Whether the section is rendered (mirrors landing_page_sections.enabled).
      enabled: z.boolean(),
      // Optimistic-concurrency version (mirrors landing_page_sections.version).
      version: z.number().int().positive(),
      fields: SECTION_FIELD_SCHEMAS[type],
    })
    .strict(),
);

// z.discriminatedUnion needs a non-empty tuple; assert it (the catalog always has 17 members).
export const sectionSchema = z.discriminatedUnion('type', [
  sectionMembers[0]!,
  ...sectionMembers.slice(1),
] as [(typeof sectionMembers)[number], ...(typeof sectionMembers)[number][]]);

export type Section = z.infer<typeof sectionSchema>;

// Validate the `fields` of a single section type — used by the Onda 9 editor (edit-path/reconcile).
export function fieldsSchemaFor(type: SectionType) {
  return SECTION_FIELD_SCHEMAS[type];
}
