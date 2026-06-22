-- D1 schema (Onda 10). Registro server-side dos eventos de tracking. NO-PII: guarda apenas
-- hashes SHA-256 de email/telefone (nunca o dado cru). PK em event_id => idempotência.
-- Aplicar: `npm run d1:apply` (wrangler d1 execute track --file=./schema.sql).

CREATE TABLE IF NOT EXISTS track_events (
  event_id        TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  landing_page_id TEXT,
  value           REAL,
  currency        TEXT,
  em_hash         TEXT,
  ph_hash         TEXT,
  gclid           TEXT,
  country         TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS track_events_lp_idx ON track_events (landing_page_id);
CREATE INDEX IF NOT EXISTS track_events_created_idx ON track_events (created_at);
