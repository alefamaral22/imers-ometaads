// Affiliate referral handling — pure helpers. When the page has affiliateEnabled, an inbound
// ?ref=<code> is captured and re-attached to the checkout URL so the sale is attributed.

// Referral codes are restricted to a safe charset (no URL-breaking / injection chars).
const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidRefCode(code: string): boolean {
  return REF_PATTERN.test(code);
}

// Extract a valid ?ref=<code> from a URL search string. Returns null when absent/invalid.
export function parseRef(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const code = params.get('ref');
  if (code === null) return null;
  return isValidRefCode(code) ? code : null;
}

// Attach a referral code to a URL as ?ref=<code> (does not overwrite an existing ref).
export function appendRef(url: string, code: string): string {
  if (!isValidRefCode(code)) return url;
  const u = new URL(url);
  if (!u.searchParams.has('ref')) u.searchParams.set('ref', code);
  return u.toString();
}
