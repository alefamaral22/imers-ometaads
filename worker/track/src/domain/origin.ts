// CORS / validação de origem — pura, deny-by-default (SPEC-015 / threat model). Só HTTPS cujo host
// é o apex configurado ou um subdomínio dele. O boundary por ponto bloqueia look-alikes
// ("evilexample.com" NÃO casa "example.com"). Sem I/O.

// Normaliza o sufixo configurado: aceita ".example.com" ou "example.com" → apex "example.com".
function bareApex(suffix: string): string {
  return suffix.replace(/^\.+/, '').toLowerCase();
}

/** Decide se a origem (header `Origin`) é permitida para o sufixo configurado. */
export function isAllowedOrigin(origin: string | null, allowedSuffix: string): boolean {
  if (origin === null || origin === '') return false;
  let host: string;
  let protocol: string;
  try {
    const u = new URL(origin);
    host = u.hostname.toLowerCase();
    protocol = u.protocol;
  } catch {
    return false;
  }
  if (protocol !== 'https:') return false;
  const apex = bareApex(allowedSuffix);
  if (apex === '') return false;
  return host === apex || host.endsWith(`.${apex}`);
}

/** Headers CORS refletindo a origem (já validada). Beacon não usa credenciais. */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
