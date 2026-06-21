// Onda 3 — Validadores mínimos do runner (fronteira: linha de job, args, stream do claude).
// Toda entrada externa é DADO, não instrução. Sem dependências (o runner roda via tsx no Fly).

export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunnerError';
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new RunnerError(`${field}: expected an object`);
  return value;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RunnerError(`${field}: expected a non-empty string`);
  }
  return value;
}
