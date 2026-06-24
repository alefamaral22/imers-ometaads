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
import { AGENCY_SCOPE } from '../../multitenant/scope';

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

function toolUses(content: AnthropicContentBlock[]): AnthropicToolUseBlock[] {
  return content.filter((b): b is AnthropicToolUseBlock => b.type === 'tool_use');
}

/** Executa uma tool de leitura no servidor (read-only) e devolve um JSON string como tool_result. */
async function executeReadTool(name: string, input: Record<string, unknown>): Promise<string> {
  const clientSlug = typeof input.client_slug === 'string' ? input.client_slug : undefined;
  // Nexus já é restrito a super_admin/socio (API /nexus/*); as leituras são da agência (global scope).
  if (name === 'get_clients') {
    return JSON.stringify(await listClients(AGENCY_SCOPE));
  }
  if (name === 'get_campaigns') {
    if (clientSlug) {
      const client = await getClientBySlug(AGENCY_SCOPE, clientSlug);
      return JSON.stringify(client ? await listCampaignsByClient(client.id) : []);
    }
    return JSON.stringify(await listAllCampaigns(AGENCY_SCOPE));
  }
  if (name === 'get_analyses') {
    if (clientSlug) {
      const client = await getClientBySlug(AGENCY_SCOPE, clientSlug);
      return JSON.stringify(client ? await listAnalysesByClient(client.id) : []);
    }
    return JSON.stringify(await listAnalyses(AGENCY_SCOPE, 20));
  }
  if (name === 'get_funnel') {
    const latest = await getLatestAnalysis(AGENCY_SCOPE);
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
    ? ((await getClientBySlug(AGENCY_SCOPE, pending.args.client_slug))?.id ?? null)
    : null;
  const row = buildAgentJobRow(clientId, pending);
  const result = await enqueueJob(row);
  const reply =
    result.status === 'enqueued'
      ? `Job enfileirado (${pending.kind}). O runner vai executar em instantes.`
      : `Já existe um job ativo deste tipo — não enfileirei outro.`;
  return { reply, job: result };
}

/** Monta a pendência (escrita = só PROPÕE) a partir do bloco tool_use de enqueue_job. */
function proposeWrite(tool: AnthropicToolUseBlock, leadingText: string): ChatResult {
  const slug = typeof tool.input.slug === 'string' ? tool.input.slug : '';
  const { slug: _omit, ...args } = tool.input;
  void _omit;
  const id = globalThis.crypto.randomUUID();
  const pending: PendingAction | null = buildPendingAction(slug, args, { id });
  if (pending === null) {
    return { reply: 'Não reconheci essa ação (slug fora da allowlist). Nada foi feito.' };
  }
  // A fala/chat é só o texto natural do modelo; a caixa de confirmação (summary + botões) cobre o
  // "pode seguir?". Não colamos o resumo formal aqui para a conversa não soar robótica nem duplicada.
  return {
    reply: leadingText || pending.summary,
    pending: {
      id: pending.id,
      slug: pending.slug,
      summary: pending.summary,
      args: compactArgs(pending.args),
    },
  };
}

const MAX_TOOL_ROUNDS = 5;

/**
 * Turno do chat com LOOP agêntico. A cada rodada o modelo pode: usar tools de LEITURA (executadas no
 * servidor; o resultado volta como tool_result e o loop continua), PROPOR uma escrita (enqueue_job →
 * pendência, encerra para confirmação) ou responder texto (encerra). Trata TODOS os tool_use de uma
 * rodada (a Anthropic exige um tool_result por tool_use). Limite de rodadas evita laço infinito.
 */
export async function runChatTurn(input: {
  message: string;
  history: Turn[];
}): Promise<ChatResult> {
  const system = buildSystemPrompt();
  const messages: AnthropicMessage[] = [
    ...historyToMessages(input.history),
    { role: 'user', content: input.message },
  ];

  let lastText = '';
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await callMessages({ system, messages, tools: ALL_TOOLS });
    const text = textOf(resp.content);
    if (text) lastText = text;
    const uses = toolUses(resp.content);

    if (uses.length === 0) {
      return { reply: lastText || '…' };
    }

    // Escrita tem prioridade e encerra o turno (propõe a pendência para confirmação).
    const write = uses.find((u) => classifyTool(u.name) === 'write');
    if (write) {
      return proposeWrite(write, text);
    }

    // Caso contrário, executa TODAS as leituras desta rodada e devolve um tool_result por tool_use.
    const results = await Promise.all(
      uses.map(async (u) => ({
        type: 'tool_result' as const,
        tool_use_id: u.id,
        content:
          classifyTool(u.name) === 'read'
            ? await executeReadTool(u.name, u.input)
            : JSON.stringify({ error: 'unknown_tool' }),
      })),
    );
    messages.push({ role: 'assistant', content: resp.content });
    messages.push({ role: 'user', content: results });
  }

  // Esgotou as rodadas sem uma resposta final — devolve o melhor texto que houve.
  return { reply: lastText || 'Não consegui concluir agora — tente de novo.' };
}
