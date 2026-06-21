// Consent (LGPD/GDPR) gate — pure helpers. Storage keys use a neutral "lp_" prefix (SPEC-000
// §8 Onda 10) so the landing page never leaks brand/PII in cookie/storage names. The serializer
// and template use these to decide whether tracking may fire before explicit consent.

export const CONSENT_STORAGE_KEY = 'lp_consent';

export type ConsentValue = 'granted' | 'denied';

// Minimal storage shapes so this lib stays DOM-free (works in node tests and the browser).
export interface ConsentReader {
  getItem(key: string): string | null;
}
export interface ConsentWriter {
  setItem(key: string, value: string): void;
}

// Read a previously stored consent decision from a storage-like record (e.g. localStorage).
export function readConsent(store: ConsentReader): ConsentValue | null {
  const raw = store.getItem(CONSENT_STORAGE_KEY);
  return raw === 'granted' || raw === 'denied' ? raw : null;
}

// Persist a consent decision.
export function writeConsent(store: ConsentWriter, value: ConsentValue): void {
  store.setItem(CONSENT_STORAGE_KEY, value);
}

// Decide whether tracking may fire. When consent is not required, tracking is always allowed;
// otherwise it requires a stored "granted" decision (deny-by-default).
export function mayTrack(consentRequired: boolean, stored: ConsentValue | null): boolean {
  if (!consentRequired) return true;
  return stored === 'granted';
}
