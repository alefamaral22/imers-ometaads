import 'server-only';
import { ALL_TOOLS, classifyTool } from '../domain/tools';
import { buildSystemPrompt } from '../domain/prompt';
import type { Turn } from '../domain/memory';
import { buildPendingAction, isConfirmation, type PendingAction } from '../domain/confirmation';
import { compactArgs } from '../domain/args';
import { buildAgentJobRow } from '../domain/enqueue';
import {
  callMessages,
  type AnthropicContentBlock,
  type AnthropicMessage,
  type AnthropicToolUseBlock,
} from './anthropic';
import { enqueueJob } from './agent-jobs';
import { getClientBySlug, listClients } from '../../services/clients';
import { listAllCampaigns, listCampaignsByClient } from '../../services/campaigns';
import {
  getLatestAnalysis,
  listAnalyses,
  listAnalysesByClient,
  listFunnelEvents,
} from '../../services/analyses';

export interface ChatPending {
  id: string;
  slug: string;
  summary: string;
  args: Record<string, string>;
}

export interface ChatResult {
  reply: string;
  pending?: ChatPending;
  job?: { status: 'enqueued' | 'already_active'; jobId: string | null };
}

function textOf(content: AnthropicContentBlock[]): string {
  return content
    .filter((b): b is Extract<AnthropicContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();
}

function firstToolUse(content: AnthropicContentBlock[]): AnthropicToolUseBlock | null {
  return content.find((b): b is AnthropicToolUseBlock => b.type === 'tool_use') ?? null;
}

/** Executa uma tool de leitura no servidor (read-only) e devolve um JSON string como tool_result. */
async function executeReadTool(name: string, input: Record<string, unknown>): Promise<string> {
  const clientSlug = typeof input.client_slug === 'string' ? input.client_slug : undefined;
  if (name === 'get_clients') {
    return JSON.stringify(await listClients());
  }
  if (name === 'get_campaigns') {
    if (clientSlug) {
      const client = await getClientBySlug(clientSlug);
      return JSON.stringify(client ? await listCampaignsByClient(client.id) : []);
    }
    return JSON.stringify(await listAllCampaigns());
  }
  if (name === 'get_analyses') {
    if (clientSlug) {
      const client = await getClientBySlug(clientSlug);
      return JSON.stringify(client ? await listAnalysesByClient(client.id) : []);
    }
    return JSON.stringify(await listAnalyses(20));
  }
  if (name === 'get_funnel') {
    const latest = await getLatestAnalysis();
    return JSON.stringify(
      latest ? { analysis: latest, events: await listFunnelEvents(latest.id) } : null,
    );
  }
  return JSON.stringify({ error: 'unknown_read_tool' });
}

function historyToMessages(history: Turn[]): AnthropicMessage[] {
  return history.map((t) => ({ role: t.role, content: t.content }));
}

/**
 * Confirmação (turno 2): reconstrói a pendência a partir de slug+args+id, exige o token exato e só
 * então enfileira o job (escrita = só enfileira). Resolve client_id pelo slug quando presente.
 */
export async function confirmAndEnqueue(input: {
  id: string;
  slug: string;
  args: Record<string, string>;
}): Promise<ChatResult> {
  const pending = buildPendingAction(input.slug, input.args, { id: input.id });
  if (pending === null) return { reply: 'Ação desconhecida — nada foi enfileirado.' };
  if (!isConfirmation(pending, input.id)) {
    return { reply: 'Confirmação inválida — nada foi enfileirado.' };
  }
  const clientId = pending.args.client_slug
    ? ((await getClientBySlug(pending.args.client_slug))?.id ?? null)
    : null;
  const row = buildAgentJobRow(clientId, pending);
  const result = await enqueueJob(row);
  const reply =
    result.status === 'enqueued'
      ? `Job enfileirado (${pending.kind}). O runner vai executar em instantes.`
      : `Já existe um job ativo deste tipo — não enfileirei outro.`;
  return { reply, job: result };
}

/**
 * Turno 1: chama o modelo com as tools. Read → executa e responde; Write (enqueue_job) → PROPÕE uma
 * pendência (não age) para confirmação no turno 2. Texto puro → resposta direta.
 */
export async function runChatTurn(input: {
  message: string;
  history: Turn[];
}): Promise<ChatResult> {
  const system = buildSystemPrompt();
  const baseMessages: AnthropicMessage[] = [
    ...historyToMessages(input.history),
    { role: 'user', content: input.message },
  ];

  const first = await callMessages({ system, messages: baseMessages, tools: ALL_TOOLS });
  const tool = firstToolUse(first.content);

  if (tool === null) {
    return { reply: textOf(first.content) || '…' };
  }

  const kind = classifyTool(tool.name);

  if (kind === 'write') {
    const slug = typeof tool.input.slug === 'string' ? tool.input.slug : '';
    const { slug: _omit, ...args } = tool.input;
    void _omit;
    const id = globalThis.crypto.randomUUID();
    const pending: PendingAction | null = buildPendingAction(slug, args, { id });
    if (pending === null) {
      return { reply: 'Não reconheci essa ação (slug fora da allowlist). Nada foi feito.' };
    }
    const reply = [textOf(first.content), pending.summary].filter(Boolean).join(' ');
    return {
      reply: reply || pending.summary,
      pending: {
        id: pending.id,
        slug: pending.slug,
        summary: pending.summary,
        args: compactArgs(pending.args),
      },
    };
  }

  if (kind === 'read') {
    const toolResult = await executeReadTool(tool.name, tool.input);
    const messages: AnthropicMessage[] = [
      ...baseMessages,
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: tool.id, content: toolResult }],
      },
    ];
    const second = await callMessages({ system, messages, tools: ALL_TOOLS });
    return { reply: textOf(second.content) || '…' };
  }

  // tool desconhecida → ignorada (deny-by-default).
  return { reply: textOf(first.content) || 'Não foi possível executar essa ação.' };
}
