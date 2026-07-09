import 'server-only';

const TARGET = 'BRL';
const cache = new Map<string, { rate: number; expiresAt: number }>();

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency || TARGET).trim().toUpperCase();
}

/**
 * Taxa de câmbio simples e cacheada em memória. Retorna multiplicador de `from` para BRL.
 * Fallback fechado: se a API falhar, mantém 1 para não quebrar dashboard; BRL segue correto.
 */
export async function brlRateFor(currency: string | null | undefined): Promise<number> {
  const from = normalizeCurrency(currency);
  if (from === TARGET) return 1;

  const now = Date.now();
  const cached = cache.get(from);
  if (cached && cached.expiresAt > now) return cached.rate;

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return 1;
    const json = (await res.json()) as { rates?: Record<string, number>; result?: string };
    const rate = json.rates?.[TARGET];
    if (!Number.isFinite(rate) || !rate || rate <= 0) return 1;
    cache.set(from, { rate, expiresAt: now + 6 * 60 * 60 * 1000 });
    return rate;
  } catch {
    return 1;
  }
}

export function convertCentsToBrl(cents: number | null | undefined, rate: number): number | null {
  if (cents === null || cents === undefined) return null;
  return Math.round(cents * rate);
}

export function convertNumberCentsToBrl(cents: number, rate: number): number {
  return Math.round(cents * rate);
}
