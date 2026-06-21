// Onda 2 — Cálculo de orçamento (SPEC §10: orçamento ≤ daily_budget_cap_cents).
// Money sempre em inteiro de centavos. Lógica pura, sem I/O, testável.

import { ValidationError } from './validation.ts';

/**
 * Garante 1 <= budget <= cap (centavos). Aborta (lança) se o teto for 0 — nenhuma campanha pode
 * nascer sem orçamento permitido. Se o pedido excede o teto, faz clamp para o teto (nunca acima).
 */
export function clampDailyBudgetCents(requestedCents: number, capCents: number): number {
  if (!Number.isInteger(requestedCents) || requestedCents < 0) {
    throw new ValidationError('requestedCents', 'expected a non-negative integer (cents)');
  }
  if (!Number.isInteger(capCents) || capCents < 0) {
    throw new ValidationError('capCents', 'expected a non-negative integer (cents)');
  }
  if (capCents === 0) {
    throw new ValidationError(
      'capCents',
      'daily_budget_cap_cents is 0 — refusing to create a campaign',
    );
  }
  const desired = requestedCents === 0 ? capCents : requestedCents;
  return Math.min(desired, capCents);
}

/** Verdadeiro só se o orçamento respeita o teto (usado como guarda final antes da escrita na Meta). */
export function isWithinBudgetCap(budgetCents: number, capCents: number): boolean {
  return (
    Number.isInteger(budgetCents) &&
    Number.isInteger(capCents) &&
    budgetCents >= 1 &&
    budgetCents <= capCents
  );
}
