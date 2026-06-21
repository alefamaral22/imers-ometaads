import 'server-only';
import { patchRows, selectRows } from '../db/client';
import {
  landingPageRowSchema,
  landingPageSectionRowSchema,
  parseRows,
  type LandingPageRow,
  type LandingPageSectionRow,
} from '../domain/schemas';
import { applyEditPath, nextVersion, reconcile, type EditSectionInput } from '../landing/edit';

/** Read one landing page by id (server-side; RLS closed to the browser). */
export async function getLandingPage(id: string): Promise<LandingPageRow | null> {
  const rows = await selectRows('landing_pages', { eq: { id }, limit: 1 });
  return parseRows(landingPageRowSchema, rows)[0] ?? null;
}

/** Read the sections of a landing page, ordered by position. */
export async function listSections(landingPageId: string): Promise<LandingPageSectionRow[]> {
  const rows = await selectRows('landing_page_sections', {
    eq: { landing_page_id: landingPageId },
    order: 'position.asc',
  });
  return parseRows(landingPageSectionRowSchema, rows);
}

export type EditOutcome =
  | { ok: true; version: number }
  | { ok: false; reason: 'not_found' | 'version_conflict' };

/**
 * Aplica uma edição pontual a uma seção de rascunho com concorrência otimista: lê a versão atual,
 * só grava se bate com a esperada (`reconcile`), e incrementa a versão. Edição síncrona (SPEC §8 Onda 9).
 */
export async function editSection(input: EditSectionInput): Promise<EditOutcome> {
  const rows = await selectRows('landing_page_sections', {
    eq: { landing_page_id: input.landing_page_id, type: input.type },
    limit: 1,
  });
  const current = parseRows(landingPageSectionRowSchema, rows)[0];
  if (!current) return { ok: false, reason: 'not_found' };
  if (!reconcile(current.version, input.expectedVersion)) {
    return { ok: false, reason: 'version_conflict' };
  }
  const fields = applyEditPath(current.fields ?? {}, input.path, input.value);
  const version = nextVersion(current.version);
  await patchRows('landing_page_sections', { id: current.id }, { fields, version });
  return { ok: true, version };
}
