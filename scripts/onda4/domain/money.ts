// Onda 4 — Conversões de dinheiro (SPEC §6: dinheiro sempre em inteiro de centavos).
// A Meta devolve valores monetários em unidades da moeda como string (ex.: "12.34"). Aqui
// normalizamos para centavos inteiros, de forma determinística e sem I/O (testável).

/** Converte um valor monetário (string/number em unidades da moeda) em centavos inteiros.
 *  Entrada inválida/ausente → null (não 0): "sem dado" é diferente de "zero gasto". */
export function currencyToCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Converte uma contagem (string/number) em inteiro ≥ 0. Ausente/inválido → null. */
export function toCount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Razão segura a/b arredondada a 6 casas. b≤0 ou inválido → null (evita divisão por zero). */
export function safeRatio(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return Math.round((a / b) * 1e6) / 1e6;
}

/** Custo por evento em centavos: spendCents/count arredondado. count≤0 → null. */
export function costPerEventCents(spendCents: number | null, count: number | null): number | null {
  if (spendCents === null || count === null) return null;
  if (!Number.isFinite(spendCents) || !Number.isFinite(count) || count <= 0) return null;
  return Math.round(spendCents / count);
}
