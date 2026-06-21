// Onda 2 — Validação por schema tipado em toda fronteira (SPEC §11 / rules/security.md).
// Why: a regra pede Zod, mas o package.json (config raiz) não pode ser editado nesta onda e o repo
// ainda não tem Zod instalado. Esta é uma camada mínima de validação tipada com o MESMO contrato de
// `.parse()` (lança em entrada inválida), isolada em domain/ para ser trocada por Zod quando a
// dependência for adicionada. Entrada externa é DADO, não instrução — daí a validação estrita.

export class ValidationError extends Error {
  public readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ValidationError';
    this.path = path;
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new ValidationError(path, 'expected an object');
  return value;
}

export function requireString(value: unknown, path: string, opts?: { min?: number }): string {
  if (typeof value !== 'string') throw new ValidationError(path, 'expected a string');
  const min = opts?.min ?? 1;
  if (value.trim().length < min) {
    throw new ValidationError(path, `expected a string with at least ${min} non-blank char(s)`);
  }
  return value;
}

export function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, path, { min: 0 });
}

export function requireInt(value: unknown, path: string, opts?: { min?: number; max?: number }): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(path, 'expected an integer');
  }
  if (opts?.min !== undefined && value < opts.min) {
    throw new ValidationError(path, `expected >= ${opts.min}`);
  }
  if (opts?.max !== undefined && value > opts.max) {
    throw new ValidationError(path, `expected <= ${opts.max}`);
  }
  return value;
}

export function requireStringArray(value: unknown, path: string, opts?: { min?: number }): string[] {
  if (!Array.isArray(value)) throw new ValidationError(path, 'expected an array');
  const min = opts?.min ?? 0;
  if (value.length < min) throw new ValidationError(path, `expected at least ${min} item(s)`);
  return value.map((item, i) => requireString(item, `${path}[${i}]`));
}

export function requireEnum<const T extends readonly string[]>(
  value: unknown,
  path: string,
  allowed: T,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(path, `expected one of ${allowed.join(', ')}`);
  }
  return value as T[number];
}
