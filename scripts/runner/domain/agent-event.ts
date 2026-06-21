// Onda 3 — Mapeia o stream-json do `claude -p` em linhas de public.agent_events (telemetria).
// PII-safe: guarda só estrutura (tipo, tool_name, contadores), NUNCA o texto/conteúdo da skill.
// Tolerante a ruído: linha inválida → nenhuma linha (não derruba o pipe).

export type AgentType = 'skill' | 'subagent' | 'tool' | 'system';
export type AgentEventType = 'start' | 'step' | 'decision' | 'error' | 'end';

export interface AgentEventRow {
  run_id: string;
  agent_name: string | null;
  agent_type: AgentType;
  event_type: AgentEventType;
  tool_name: string | null;
  payload: Record<string, unknown>;
}

function row(
  runId: string,
  agentType: AgentType,
  eventType: AgentEventType,
  payload: Record<string, unknown>,
  toolName: string | null = null,
  agentName: string | null = null,
): AgentEventRow {
  return {
    run_id: runId,
    agent_name: agentName,
    agent_type: agentType,
    event_type: eventType,
    tool_name: toolName,
    payload,
  };
}

interface ToolUseBlock {
  type: string;
  name?: unknown;
}

/**
 * Converte UMA linha do stream-json em zero ou mais eventos. O Claude Code emite JSONL com objetos
 * `{type: 'system'|'assistant'|'user'|'result', ...}`. Mapeamos:
 *   system/init        → start
 *   assistant tool_use → step (um por tool_use; tool_name preenchido)
 *   result             → end (ou error se is_error)
 * Demais tipos (user/tool_result/texto) são ignorados — telemetria, não log de conteúdo.
 */
export function mapStreamLine(line: string, runId: string): AgentEventRow[] {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];
  let msg: unknown;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return []; // ruído (texto não-JSON) é ignorado de propósito
  }
  if (typeof msg !== 'object' || msg === null) return [];
  const m = msg as Record<string, unknown>;
  const type = typeof m.type === 'string' ? m.type : '';

  if (type === 'system') {
    if (m.subtype === 'init') return [row(runId, 'system', 'start', { subtype: 'init' })];
    return [];
  }

  if (type === 'assistant') {
    const message = m.message;
    const content =
      typeof message === 'object' && message !== null
        ? (message as Record<string, unknown>).content
        : undefined;
    if (!Array.isArray(content)) return [];
    const events: AgentEventRow[] = [];
    for (const block of content as ToolUseBlock[]) {
      if (block && block.type === 'tool_use') {
        const toolName = typeof block.name === 'string' ? block.name : null;
        events.push(row(runId, 'tool', 'step', { kind: 'tool_use' }, toolName));
      }
    }
    return events;
  }

  if (type === 'result') {
    const isError = m.is_error === true || m.subtype === 'error';
    const payload: Record<string, unknown> = {};
    if (typeof m.num_turns === 'number') payload.num_turns = m.num_turns;
    if (typeof m.duration_ms === 'number') payload.duration_ms = m.duration_ms;
    return [row(runId, 'system', isError ? 'error' : 'end', payload)];
  }

  if (type === 'error') {
    return [
      row(runId, 'system', 'error', {
        subtype: typeof m.subtype === 'string' ? m.subtype : 'error',
      }),
    ];
  }

  return [];
}

/** Eventos-marco garantidos pelo runner (não dependem do formato exato da saída do claude). */
export function startEvent(runId: string, skill: string): AgentEventRow {
  return row(runId, 'skill', 'start', { source: 'runner' }, null, skill);
}

export function endEvent(runId: string, skill: string, exitCode: number): AgentEventRow {
  return row(
    runId,
    'skill',
    exitCode === 0 ? 'end' : 'error',
    { source: 'runner', exit_code: exitCode },
    null,
    skill,
  );
}
