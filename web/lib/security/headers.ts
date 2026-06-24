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

export function buildContentSecurityPolicy(nonce: string, dev = false): string {
  // Prod: 'strict-dynamic' + nonce — Next's bootstrap carrega seus chunks sem listar cada hash e
  // bloqueia script inline/injetado. Dev: o Next usa eval (HMR/React Refresh) e um websocket de
  // hot-reload, que a política estrita bloquearia (a página não hidrataria). Por isso, SÓ em dev,
  // relaxamos script-src ('unsafe-eval'/'unsafe-inline') e connect-src (ws:) — nunca em produção.
  const scriptSrc = dev
    ? ["'self'", "'unsafe-eval'", "'unsafe-inline'", 'https://challenges.cloudflare.com']
    : ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", 'https://challenges.cloudflare.com'];
  const connectSrc = dev ? ["'self'", 'ws:', 'wss:'] : ["'self'"];

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'script-src': scriptSrc,
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    // O TTS do Nexus toca o áudio (audio/mpeg) a partir de um blob: URL — sem isto cairia no
    // default-src 'self' e o navegador bloquearia a reprodução da voz.
    'media-src': ["'self'", 'blob:'],
    'font-src': ["'self'"],
    'connect-src': connectSrc,
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
export function buildSecurityHeaders(nonce: string, dev = false): SecurityHeaders {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(nonce, dev),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // microphone=(self): o Nexus precisa do mic (push-to-talk e mãos-livres) na própria origem.
    // câmera e geolocalização seguem desabilitadas (não usadas).
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
    // Propagated to Server Components so they can read the nonce when emitting inline scripts.
    'x-nonce': nonce,
  };
}
