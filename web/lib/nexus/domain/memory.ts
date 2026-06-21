/**
 * Nexus — memória de sessão (curto prazo). Buffer limitado de turnos para dar contexto ao chat loop
 * sem crescer sem limite. Pura/imutável: cada operação devolve um novo estado. Sem PII persistida
 * além do necessário para a conversa corrente (em memória de processo, não no banco).
 */

export type TurnRole = 'user' | 'assistant';

export interface Turn {
  role: TurnRole;
  content: string;
}

export interface SessionMemory {
  sessionId: string;
  turns: Turn[];
  maxTurns: number;
}

export function createMemory(sessionId: string, maxTurns = 20): SessionMemory {
  return { sessionId, turns: [], maxTurns };
}

/** Acrescenta um turno, mantendo no máximo `maxTurns` (descarta os mais antigos). */
export function appendTurn(memory: SessionMemory, turn: Turn): SessionMemory {
  const turns = [...memory.turns, turn];
  const overflow = turns.length - memory.maxTurns;
  return { ...memory, turns: overflow > 0 ? turns.slice(overflow) : turns };
}

export function recentTurns(memory: SessionMemory, n: number): Turn[] {
  return n <= 0 ? [] : memory.turns.slice(-n);
}
