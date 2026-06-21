/**
 * Security headers (SPEC-000 §11). Applied to EVERY response by middleware.ts. The CSP carries
 * a per-request nonce so inline scripts injected by Next can be allowlisted without
 * 'unsafe-inline'. These builders are pure so the policy is unit tested.
 */

/** 16 random bytes, base64 — unique per request. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildContentSecurityPolicy(nonce: string): string {
  // Why 'strict-dynamic' + nonce: lets Next's bootstrap script load its chunks without
  // listing every hash, while blocking arbitrary inline/injected scripts.
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Cloudflare Turnstile widget (optional login bot protection).
      'https://challenges.cloudflare.com',
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'frame-src': ['https://challenges.cloudflare.com'],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

export interface SecurityHeaders {
  [name: string]: string;
}

/**
 * The full security header set for every response. HSTS, CSP (nonce), X-Content-Type-Options,
 * X-Frame-Options, Referrer-Policy + a couple of hardening extras.
 */
export function buildSecurityHeaders(nonce: string): SecurityHeaders {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(nonce),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    // Propagated to Server Components so they can read the nonce when emitting inline scripts.
    'x-nonce': nonce,
  };
}
