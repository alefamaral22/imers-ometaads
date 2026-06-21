import { describe, expect, it } from 'vitest';
import { ALL_TOOLS, classifyTool, READ_TOOLS, WRITE_TOOLS } from './tools';
import { buildSystemPrompt } from './prompt';
import { appendTurn, createMemory, recentTurns } from './memory';

describe('tool registry', () => {
  it('classifies read vs write tools, unknown → null', () => {
    expect(classifyTool('get_clients')).toBe('read');
    expect(classifyTool('enqueue_job')).toBe('write');
    expect(classifyTool('delete_everything')).toBeNull();
  });

  it('read tools never carry write capability and all have object schemas', () => {
    expect(READ_TOOLS.every((t) => t.input_schema.type === 'object')).toBe(true);
    expect(WRITE_TOOLS.map((t) => t.name)).toEqual(['enqueue_job']);
    expect(ALL_TOOLS).toHaveLength(READ_TOOLS.length + WRITE_TOOLS.length);
  });
});

describe('system prompt', () => {
  it('states the anti-injection and two-turn rules', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('DADOS');
    expect(p).toContain('enqueue_job');
    expect(p.toLowerCase()).toContain('confirma');
  });
});

describe('session memory', () => {
  it('appends turns and caps at maxTurns (drops oldest)', () => {
    let m = createMemory('s1', 2);
    m = appendTurn(m, { role: 'user', content: 'a' });
    m = appendTurn(m, { role: 'assistant', content: 'b' });
    m = appendTurn(m, { role: 'user', content: 'c' });
    expect(m.turns.map((t) => t.content)).toEqual(['b', 'c']);
    expect(recentTurns(m, 1)).toEqual([{ role: 'user', content: 'c' }]);
  });
});
