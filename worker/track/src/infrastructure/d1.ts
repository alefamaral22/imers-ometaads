// Registro server-side em D1. NO-PII: guarda apenas HASHES SHA-256 (nunca email/telefone cru).
// INSERT OR IGNORE por event_id (PK) => idempotente sob retry/duplicação.

import type { D1Database } from '@cloudflare/workers-types';
import type { TrackingEvent } from '../domain/event.ts';
import type { HashedUserData } from '../application/fanout.ts';

export async function storeEvent(
  db: D1Database,
  ev: TrackingEvent,
  hashes: HashedUserData,
  country: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO track_events
         (event_id, event_type, landing_page_id, value, currency, em_hash, ph_hash, gclid, country, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      ev.eventId,
      ev.eventType,
      ev.landingPageId,
      ev.value,
      ev.currency,
      hashes.em,
      hashes.ph,
      ev.gclid,
      country,
      new Date().toISOString(),
    )
    .run();
}
