// Onda 8 (cont.) — Invariantes do rascunho de landing page (SPEC §8 Onda 8). A validação PROFUNDA por
// seção é do pacote @template/lp-render (no publish, via serializer). Aqui garantimos os invariantes
// estruturais persistidos em landing_page_sections. Pura/testável, sem I/O.

import { ValidationError } from '../../onda2/domain/validation.ts';

// As 17 seções do catálogo (espelha @template/lp-render SECTION_TYPES e landing_page_sections.type).
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
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export interface DraftSection {
  type: SectionType;
  position: number;
  enabled: boolean;
  version: number;
  fields: Record<string, unknown>;
}

export function isSectionType(value: unknown): value is SectionType {
  return typeof value === 'string' && (SECTION_TYPES as readonly string[]).includes(value);
}

/**
 * Invariantes de um rascunho persistível:
 *  - ≥1 seção; todo `type` é do catálogo; tipos únicos (espelha unique(landing_page_id,type));
 *  - existe um `hero` (toda LP real tem dobra principal);
 *  - position inteiro ≥ 0 e version inteiro ≥ 1.
 * Lança ValidationError no primeiro problema. NÃO valida os fields por seção (isso é do serializer).
 */
export function assertDraftInvariants(sections: DraftSection[]): void {
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new ValidationError('sections', 'expected at least one section');
  }
  const seen = new Set<string>();
  for (const [i, s] of sections.entries()) {
    if (!isSectionType(s.type))
      throw new ValidationError(`sections[${i}].type`, 'unknown section type');
    if (seen.has(s.type))
      throw new ValidationError(`sections[${i}].type`, `duplicate section: ${s.type}`);
    seen.add(s.type);
    if (!Number.isInteger(s.position) || s.position < 0) {
      throw new ValidationError(`sections[${i}].position`, 'expected a non-negative integer');
    }
    if (!Number.isInteger(s.version) || s.version < 1) {
      throw new ValidationError(`sections[${i}].version`, 'expected an integer >= 1');
    }
  }
  if (!seen.has('hero'))
    throw new ValidationError('sections', 'a landing page requires a hero section');
}
