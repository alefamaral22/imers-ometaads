// UTM handling — pure helpers. Runtime UTMs (from the page URL) take precedence over the
// page's baked-in defaults; the merged set is what gets propagated to checkout/affiliate links
// and to the tracking payload. No I/O — callers pass the query string in.

export const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmParams = Partial<Record<UtmKey, string>>;

// Parse utm_* params out of a URL search string ("?utm_source=fb&..."). Unknown params ignored.
export function parseUtm(search: string): UtmParams {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const out: UtmParams = {};
  for (const key of UTM_KEYS) {
    const value = params.get(`utm_${key}`);
    if (value !== null && value !== '') out[key] = value;
  }
  return out;
}

// Merge defaults with runtime UTMs; runtime wins. Result is deterministic (fixed key order).
export function mergeUtm(defaults: UtmParams, runtime: UtmParams): UtmParams {
  const out: UtmParams = {};
  for (const key of UTM_KEYS) {
    const value = runtime[key] ?? defaults[key];
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

// Append utm_* params to a URL, preserving existing query and not overwriting present utm_* keys.
export function appendUtm(url: string, utm: UtmParams): string {
  const u = new URL(url);
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (value !== undefined && !u.searchParams.has(`utm_${key}`)) {
      u.searchParams.set(`utm_${key}`, value);
    }
  }
  return u.toString();
}
