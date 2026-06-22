// Rate limit por janela fixa — pura. A infra (KV) só guarda/lê o estado; a decisão vive aqui
// (testável). Quando a janela expira, reinicia; dentro da janela, conta até `max`.

export interface RateWindow {
  count: number;
  resetAt: number; // epoch ms em que a janela atual termina
}

export interface RateResult {
  allowed: boolean;
  next: RateWindow; // estado a persistir quando allowed
  retryAfterSec: number; // > 0 só quando bloqueado
}

export function evaluateRate(
  prev: RateWindow | null,
  now: number,
  windowMs: number,
  max: number,
): RateResult {
  if (prev === null || now >= prev.resetAt) {
    return { allowed: true, next: { count: 1, resetAt: now + windowMs }, retryAfterSec: 0 };
  }
  if (prev.count < max) {
    return {
      allowed: true,
      next: { count: prev.count + 1, resetAt: prev.resetAt },
      retryAfterSec: 0,
    };
  }
  return {
    allowed: false,
    next: prev,
    retryAfterSec: Math.max(1, Math.ceil((prev.resetAt - now) / 1000)),
  };
}
