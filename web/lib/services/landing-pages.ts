import 'server-only';
import { selectRows } from '../db/client';
import { landingPageRowSchema, parseRows, type LandingPageRow } from '../domain/schemas';

export async function listLandingPages(limit = 200): Promise<LandingPageRow[]> {
  const rows = await selectRows('landing_pages', { order: 'updated_at.desc', limit });
  return parseRows(landingPageRowSchema, rows);
}

export async function listLandingPagesByClient(clientId: string): Promise<LandingPageRow[]> {
  const rows = await selectRows('landing_pages', {
    eq: { client_id: clientId },
    order: 'updated_at.desc',
  });
  return parseRows(landingPageRowSchema, rows);
}
