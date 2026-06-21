/**
 * Pure presentation formatters (domain). Money is stored as integer cents (SPEC-000 §6); these
 * helpers turn cents into display strings. No I/O, fully unit tested.
 */

export function formatCents(
  cents: number | null | undefined,
  currency = 'BRL',
  locale = 'pt-BR',
): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

export function formatInteger(value: number | null | undefined, locale = 'pt-BR'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(locale).format(value);
}

/** Ratio (0..1) -> percentage string. Used for CTR / CVR. */
export function formatRatioPercent(
  ratio: number | null | undefined,
  fractionDigits = 2,
  locale = 'pt-BR',
): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}

export function formatDate(value: string | null | undefined, locale = 'pt-BR'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
