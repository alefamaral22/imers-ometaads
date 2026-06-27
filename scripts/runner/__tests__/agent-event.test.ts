import { describe, expect, it } from 'vitest';
import {
  endEvent,
  extractResultError,
  mapStreamLine,
  startEvent,
} from '../domain/agent-event.ts';

const RUN = 'job-123';

describe('mapStreamLine', () => {
  it('maps system/init to a start event', () => {
    const [ev] = mapStreamLine(JSON.stringify({ type: 'system', subtype: 'init' }), RUN);
    expect(ev).toMatchObject({ run_id: RUN, agent_type: 'system', event_type: 'start' });
  });

  it('maps each assistant tool_use to a step event with tool_name', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'thinking' },
          { type: 'tool_use', name: 'mcp__claude_ai_META_ADS__ads_create_campaign' },
          { type: 'tool_use', name: 'Bash' },
        ],
      },
    });
    const evs = mapStreamLine(line, RUN);
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({
      event_type: 'step',
      agent_type: 'tool',
      tool_name: 'mcp__claude_ai_META_ADS__ads_create_campaign',
    });
    expect(evs[1]?.tool_name).toBe('Bash');
  });

  it('maps result to end, or error when is_error', () => {
    expect(mapStreamLine(JSON.stringify({ type: 'result', num_turns: 4 }), RUN)[0]).toMatchObject({
      event_type: 'end',
    });
    expect(mapStreamLine(JSON.stringify({ type: 'result', is_error: true }), RUN)[0]).toMatchObject(
      { event_type: 'error' },
    );
  });

  it('ignores noise: invalid JSON, empty lines, and unrelated types', () => {
    expect(mapStreamLine('not json', RUN)).toEqual([]);
    expect(mapStreamLine('   ', RUN)).toEqual([]);
    expect(mapStreamLine(JSON.stringify({ type: 'user' }), RUN)).toEqual([]);
  });

  it('never leaks free text into the payload (PII-safe)', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'secret' } }] },
    });
    const [ev] = mapStreamLine(line, RUN);
    expect(JSON.stringify(ev?.payload)).not.toContain('secret');
  });
});

describe('extractResultError', () => {
  it('extrai o texto de um result com is_error', () => {
    const line = JSON.stringify({ type: 'result', is_error: true, result: 'Credit balance too low' });
    expect(extractResultError(line)).toBe('Credit balance too low');
  });

  it('usa o subtype quando não há texto de result', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'error_during_execution' });
    expect(extractResultError(line)).toBe('claude result: error_during_execution');
  });

  it('extrai mensagem de uma linha type=error', () => {
    const line = JSON.stringify({ type: 'error', error: 'invalid x-api-key' });
    expect(extractResultError(line)).toBe('invalid x-api-key');
  });

  it('retorna null para result de sucesso e para ruído', () => {
    expect(extractResultError(JSON.stringify({ type: 'result', subtype: 'success' }))).toBeNull();
    expect(extractResultError(JSON.stringify({ type: 'assistant' }))).toBeNull();
    expect(extractResultError('not json')).toBeNull();
    expect(extractResultError('   ')).toBeNull();
  });

  it('trunca mensagens muito longas em 2000 chars', () => {
    const line = JSON.stringify({ type: 'result', is_error: true, result: 'x'.repeat(5000) });
    expect(extractResultError(line)?.length).toBe(2000);
  });
});

describe('runner bookend events', () => {
  it('startEvent and endEvent carry the skill name and exit code', () => {
    expect(startEvent(RUN, 'create-traffic')).toMatchObject({
      event_type: 'start',
      agent_type: 'skill',
      agent_name: 'create-traffic',
    });
    expect(endEvent(RUN, 'create-traffic', 0).event_type).toBe('end');
    expect(endEvent(RUN, 'create-traffic', 1).event_type).toBe('error');
  });
});
