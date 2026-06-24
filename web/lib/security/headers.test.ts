import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, buildSecurityHeaders } from './headers';

describe('buildContentSecurityPolicy', () => {
  it('prod (default): nonce + strict-dynamic, sem eval/ws', () => {
    const csp = buildContentSecurityPolicy('abc123');
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('ws:');
    // media-src libera blob: para a reprodução do áudio do TTS (voz do Nexus).
    expect(csp).toMatch(/media-src[^;]*\bblob:/);
  });

  it('dev: relaxa script-src (eval/inline) e connect-src (ws) p/ o HMR do Next', () => {
    const csp = buildContentSecurityPolicy('abc123', true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toMatch(/connect-src[^;]*\bws:/);
    // sem strict-dynamic em dev (senão 'unsafe-inline' seria ignorado pelo browser)
    expect(csp).not.toContain("'strict-dynamic'");
  });
});

describe('buildSecurityHeaders', () => {
  it('traz o conjunto de headers e propaga o modo dev ao CSP', () => {
    const h = buildSecurityHeaders('n0nce', true);
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['x-nonce']).toBe('n0nce');
    expect(h['Content-Security-Policy']).toContain("'unsafe-eval'");
    // O mic é liberado para a própria origem (Nexus voz); câmera/geo seguem desabilitadas.
    expect(h['Permissions-Policy']).toBe('camera=(), microphone=(self), geolocation=()');
  });
});
