import { describe, expect, it } from 'vitest';
import { assertSafeArgs, validateSkillName } from '../domain/skill.ts';
import { RunnerError } from '../domain/validation.ts';

const SKILLS = ['create-traffic-cliente-exemplo-campaign', 'lista-de-clientes'];

describe('validateSkillName', () => {
  it('accepts a name that exists on disk', () => {
    expect(validateSkillName('lista-de-clientes', SKILLS)).toBe('lista-de-clientes');
  });

  it('rejects a name not on disk (allowlist)', () => {
    expect(() => validateSkillName('rm-rf', SKILLS)).toThrow(RunnerError);
  });

  it('rejects names with shell metacharacters', () => {
    for (const bad of ['a; rm', 'a b', 'A_B', '../x', 'x$(id)']) {
      expect(() => validateSkillName(bad, [...SKILLS, bad])).toThrow();
    }
  });
});

describe('assertSafeArgs', () => {
  it('passes flat string/number/boolean args through as strings', () => {
    expect(assertSafeArgs({ client: 'cliente-exemplo', n: 3, on: true })).toEqual({
      client: 'cliente-exemplo',
      n: '3',
      on: 'true',
    });
  });

  it('treats null/undefined as empty', () => {
    expect(assertSafeArgs(null)).toEqual({});
    expect(assertSafeArgs(undefined)).toEqual({});
  });

  it('rejects nested objects and arrays', () => {
    expect(() => assertSafeArgs({ a: { b: 1 } })).toThrow(RunnerError);
    expect(() => assertSafeArgs(['a'])).toThrow(RunnerError);
  });

  it('rejects unsafe values (shell injection chars)', () => {
    for (const bad of ['$(whoami)', '`id`', 'a|b', 'a;b', 'a>b', 'a&b']) {
      expect(() => assertSafeArgs({ x: bad })).toThrow(RunnerError);
    }
  });

  it('rejects invalid keys', () => {
    expect(() => assertSafeArgs({ 'bad key': 'v' })).toThrow(RunnerError);
  });
});
