// Pure, deterministic serializer: ContentDoc -> { messages/pt.json, content-spec.json, theme.css }.
// No I/O, no clock, no rng. Same ContentDoc always yields byte-identical artifacts (golden tests).
import type { ContentDoc } from '../content-doc.js';
import type { Section } from '../sections/section.js';
import { themeToCss } from '../theme/to-css.js';
import type { ContentSpec, ContentSpecSection, Messages } from './artifacts.js';

export interface SerializedArtifacts {
  // File contents keyed by their relative path under the template's generated/ dir.
  'messages/pt.json': string;
  'content-spec.json': string;
  'theme.css': string;
}

// Order sections deterministically: by `position`, then by insertion order is *not* stable enough,
// so ties break on section type to keep output reproducible regardless of input array order.
function orderSections(sections: readonly Section[]): Section[] {
  return [...sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.position - b.position || a.type.localeCompare(b.type));
}

// Walk a section's fields and collect every string into the messages bag under "<key>.<path>".
// Non-string values stay in content-spec; strings become i18n entries (single source of copy).
function collectMessages(key: string, value: unknown, prefix: string, out: Messages): void {
  if (typeof value === 'string') {
    out[prefix] = value;
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectMessages(key, item, `${prefix}.${i}`, out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    // Sort object keys so traversal order (and thus message-key order) is deterministic.
    for (const k of Object.keys(value).sort()) {
      collectMessages(key, (value as Record<string, unknown>)[k], `${prefix}.${k}`, out);
    }
  }
}

// Stable JSON stringify with sorted object keys (arrays keep order) for byte-stable artifacts.
function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2) + '\n';
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      sorted[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

export function serialize(doc: ContentDoc): SerializedArtifacts {
  const ordered = orderSections(doc.sections);

  const messages: Messages = {};
  const specSections: ContentSpecSection[] = ordered.map((section) => {
    collectMessages(section.type, section.fields, section.type, messages);
    return {
      type: section.type,
      position: section.position,
      key: section.type,
      fields: section.fields,
    };
  });

  const spec: ContentSpec = {
    version: 1,
    settings: {
      subdomain: doc.settings.subdomain,
      locale: doc.settings.locale,
      noindex: doc.settings.noindex,
      cartState: doc.settings.cartState,
      affiliateEnabled: doc.settings.affiliateEnabled,
      consentRequired: doc.settings.consentRequired,
      ...(doc.settings.checkoutUrl !== undefined && { checkoutUrl: doc.settings.checkoutUrl }),
      ...(doc.settings.priceCents !== undefined && { priceCents: doc.settings.priceCents }),
      ...(doc.settings.currency !== undefined && { currency: doc.settings.currency }),
      ...(doc.settings.utmDefaults !== undefined && {
        utmDefaults: pruneUndefined(doc.settings.utmDefaults),
      }),
      ...(doc.settings.tracking !== undefined && {
        tracking: pruneUndefined(doc.settings.tracking),
      }),
    },
    sections: specSections,
  };

  return {
    'messages/pt.json': stableStringify(messages),
    'content-spec.json': stableStringify(spec),
    'theme.css': themeToCss(doc.theme),
  };
}

// Drop undefined-valued keys from an optional-string record so artifacts stay clean.
function pruneUndefined(obj: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
