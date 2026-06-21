// Onda 8 (cont.) — Plano de publicação: monta o ContentDoc a partir das linhas do banco
// (landing_pages.settings/theme + landing_page_sections) e o patch de pós-deploy. O serializer real
// (@template/lp-render) e o `next build`/`wrangler deploy` ficam na skill. Pura/testável.

import {
  assertDraftInvariants,
  isSectionType,
  type DraftSection,
} from '../domain/landing-draft.ts';
import { ValidationError } from '../../onda2/domain/validation.ts';

export interface ContentDocObject {
  settings: Record<string, unknown>;
  theme: Record<string, unknown>;
  sections: DraftSection[];
}

interface SectionRowLike {
  type: unknown;
  position: unknown;
  enabled: unknown;
  version: unknown;
  fields: unknown;
}

/** Reconstrói o ContentDoc a partir das linhas do banco, ordenando por position e validando invariantes. */
export function assembleContentDoc(
  lp: { settings: unknown; theme: unknown },
  sectionRows: SectionRowLike[],
): ContentDocObject {
  const settings = lp.settings;
  const theme = lp.theme;
  if (settings === null || typeof settings !== 'object') {
    throw new ValidationError('landing_pages.settings', 'expected an object');
  }
  if (theme === null || typeof theme !== 'object') {
    throw new ValidationError('landing_pages.theme', 'expected an object');
  }
  const sections: DraftSection[] = sectionRows
    .filter((r) => r.enabled !== false)
    .map((r, i) => {
      if (!isSectionType(r.type)) throw new ValidationError(`sections[${i}].type`, 'unknown type');
      return {
        type: r.type,
        position: typeof r.position === 'number' ? r.position : i,
        enabled: r.enabled !== false,
        version: typeof r.version === 'number' ? r.version : 1,
        fields: (r.fields ?? {}) as Record<string, unknown>,
      };
    })
    .sort((a, b) => a.position - b.position || a.type.localeCompare(b.type));

  assertDraftInvariants(sections);
  return {
    settings: settings as Record<string, unknown>,
    theme: theme as Record<string, unknown>,
    sections,
  };
}

/** Patch de landing_pages após deploy bem-sucedido em preview (<subdomain>.example.com). */
export function publishPatch(args: {
  url: string;
  fqdn: string;
  cloudflareProjectId?: string | null;
  snapshot: unknown;
}): Record<string, unknown> {
  return {
    status: 'deployed',
    draft_status: 'ready',
    url: args.url,
    fqdn: args.fqdn,
    ssl_status: 'active',
    cloudflare_project_id: args.cloudflareProjectId ?? null,
    published_snapshot: args.snapshot,
  };
}
