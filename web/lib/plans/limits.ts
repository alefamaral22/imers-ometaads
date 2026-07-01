/**
 * Onda A — Checagem de limite de plano. Pura (sem I/O), testável. `limit` null = ilimitado.
 * `current` é a contagem atual do recurso; o estouro acontece quando criar mais UM passaria do teto.
 */
export type LimitCheck = { ok: true } | { ok: false; limit: number; current: number };

export function checkPlanLimit(input: { limit: number | null; current: number }): LimitCheck {
  if (input.limit === null) return { ok: true };
  if (input.current < input.limit) return { ok: true };
  return { ok: false, limit: input.limit, current: input.current };
}
