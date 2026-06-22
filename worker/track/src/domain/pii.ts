// Normalização de PII para hashing (Meta CAPI exige email minúsculo/trim e telefone só-dígitos).
// PII crua NUNCA é persistida; só hashes SHA-256 vão às plataformas e só flags de presença chegam
// ao espelho NO-PII (lp_events). Sem I/O — o hashing em si (async, Web Crypto) fica na infra.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string | null): boolean {
  return email !== null && EMAIL_RE.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isValidPhone(phone: string | null): boolean {
  if (phone === null) return false;
  const digits = normalizePhone(phone);
  return digits.length >= 7 && digits.length <= 15;
}

/** Flags de presença para o espelho NO-PII (lp_events). Recebem só o juízo, nunca o dado. */
export function presenceFlags(
  email: string | null,
  phone: string | null,
): { hasEmail: boolean; hasPhone: boolean } {
  return { hasEmail: isValidEmail(email), hasPhone: isValidPhone(phone) };
}
