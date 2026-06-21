// @template/lp-render — public surface.
// Turns the Supabase-persisted ContentDoc into LP build artifacts + shared LP runtime libs.
// SPEC-000 §8 Onda 8 / §10. All inputs are validated by Zod at the boundary (untrusted content).

// Core content contract
export { contentDocSchema, parseContentDoc, type ContentDoc } from './content-doc.js';

// Settings & theme
export {
  settingsSchema,
  defaultSettings,
  subdomainSchema,
  httpsUrlSchema,
  cartStateSchema,
  type Settings,
} from './settings/index.js';
export { themeSchema, defaultTheme, themeToCss, type Theme } from './theme/index.js';

// Sections (17-section catalog)
export {
  SECTION_FIELD_SCHEMAS,
  SECTION_TYPES,
  sectionSchema,
  fieldsSchemaFor,
  type SectionType,
  type Section,
  type Cta,
  type IconName,
} from './sections/index.js';

// Serializer
export {
  serialize,
  writeArtifacts,
  type SerializedArtifacts,
  type ContentSpec,
  type ContentSpecSection,
  type Messages,
} from './serializer/index.js';

// Runtime libs
export * as utm from './lib/utm.js';
export * as affiliate from './lib/affiliate.js';
export * as checkout from './lib/checkout.js';
export * as consent from './lib/consent.js';
