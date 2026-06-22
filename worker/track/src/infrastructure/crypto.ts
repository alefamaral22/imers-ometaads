// SHA-256 hex via Web Crypto (disponível no runtime do Worker). Usado para hashear PII
// normalizada antes do fan-out (exigência do Meta CAPI). A PII crua nunca é persistida.

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
