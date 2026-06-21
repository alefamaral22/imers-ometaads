// Onda 3 — Resolução e validação de skill/args (SPEC §10: skill por allowlist on-disk, args com
// charset restrito). Nunca executa texto livre: o nome da skill precisa existir em disco e os args
// passam por um charset seguro antes de chegar perto de um shell.

import { RunnerError, requireString } from './validation.ts';

// Slug de skill: minúsculas, dígitos e hífen. Mesmo padrão dos diretórios em .claude/skills/.
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

// Charset seguro para valores de args: alfanumérico + um conjunto pequeno de pontuação inócua.
// Sem aspas, crases, $, ;, |, &, <, >, barra invertida, parênteses — nada que vire injeção de shell.
const ARG_KEY_RE = /^[a-z0-9_]{1,40}$/i;
const ARG_VALUE_RE = /^[\w\-.,:/@ ]{0,200}$/;

/**
 * Valida o nome da skill contra a allowlist on-disk (os diretórios reais de .claude/skills/).
 * Resolver por allowlist (não por texto livre) é o contrato de segurança do runner/Nexus (SPEC §10).
 */
export function validateSkillName(name: string, availableSkills: readonly string[]): string {
  if (!SKILL_NAME_RE.test(name)) {
    throw new RunnerError(`invalid skill name: ${JSON.stringify(name)}`);
  }
  if (!availableSkills.includes(name)) {
    throw new RunnerError(`unknown skill (not on disk): ${name}`);
  }
  return name;
}

/**
 * Valida os args do job (jsonb). Aceita apenas string/number/boolean com chave e valor no charset
 * seguro. Rejeita objetos aninhados, arrays e qualquer caractere de shell. Retorna args como strings.
 */
export function assertSafeArgs(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new RunnerError('args: expected a flat object');
  }
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!ARG_KEY_RE.test(key)) throw new RunnerError(`args: invalid key ${JSON.stringify(key)}`);
    let str: string;
    if (typeof raw === 'string') str = raw;
    else if (typeof raw === 'number' || typeof raw === 'boolean') str = String(raw);
    else throw new RunnerError(`args.${key}: only string/number/boolean allowed`);
    if (!ARG_VALUE_RE.test(str)) throw new RunnerError(`args.${key}: unsafe value`);
    out[key] = str;
  }
  return out;
}

/** O prompt headless que dispara a skill (forma usada na Onda 2: `claude -p ".claude/skills/<x>"`). */
export function skillPromptPath(name: string): string {
  return `.claude/skills/${requireString(name, 'skill')}`;
}
