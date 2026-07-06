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
import { listConnections } from '../../services/connections';
import {
  getLatestAnalysis,
  listAnalyses,
  listAnalysesByClient,
  listFunnelEvents,
} from '../../services/analyses';
import { getLatestSnapshot } from '../../services/live-snapshots';
import { getRecentJobs, getLatestLanding } from '../../services/jobs';
import type { AccountScope } from '../../multitenant/scope';

// Cliente default do template quando o operador não nomeia um (há só um cadastrado).
const DEFAULT_CLIENT_SLUG = 'cliente-exemplo';

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
  // Onda 16 — quando o Nexus dispara um raio-x ao vivo (read-only): a UI faz polling até ficar pronto
  // e então envia um turno de follow-up para o Nexus narrar. jobId null quando já havia um em curso.
  snapshot?: { status: 'enqueued' | 'already_active'; jobId: string | null };
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

/**
 * Executa uma tool de leitura no servidor (read-only) e devolve um JSON string como tool_result.
 * `scope` é o escopo REAL da sessão que chamou o Nexus — super_admin/socio continuam vendo tudo
 * (scopeEq retorna null pra eles), mas cliente_usuario fica restrito à própria account, exatamente
 * como em qualquer outra leitura do dashboard. Nunca usar AGENCY_SCOPE fixo aqui.
 */
async function executeReadTool(
  scope: AccountScope,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const clientSlug = typeof input.client_slug === 'string' ? input.client_slug : undefined;
  if (name === 'get_clients') {
    return JSON.stringify(await listClients(scope));
  }
  if (name === 'get_campaigns') {
    if (clientSlug) {
      const client = await getClientBySlug(scope, clientSlug);
      return JSON.stringify(client ? await listCampaignsByClient(client.id) : []);
    }
    return JSON.stringify(await listAllCampaigns(scope));
  }
  if (name === 'get_ad_accounts') {
    const connections = await listConnections(scope);
    return JSON.stringify(
      connections.map((c) => ({
        meta_ad_account_id: c.meta_ad_account_id,
        client_id: c.client_id,
        status: c.status,
        label: c.token_label,
      })),
    );
  }
  if (name === 'get_analyses') {
    if (clientSlug) {
      const client = await getClientBySlug(scope, clientSlug);
      return JSON.stringify(client ? await listAnalysesByClient(client.id) : []);
    }
    return JSON.stringify(await listAnalyses(scope, 20));
  }
  if (name === 'get_funnel') {
    const latest = await getLatestAnalysis(scope);
    return JSON.stringify(
      latest ? { analysis: latest, events: await listFunnelEvents(latest.id) } : null,
    );
  }
  if (name === 'get_job_status') {
    // Andamento dos pedidos recentes + estado da landing — para o Nexus narrar status/erro/link.
    const clientId = clientSlug
      ? ((await getClientBySlug(scope, clientSlug))?.id ?? undefined)
      : undefined;
    const [jobs, landing] = await Promise.all([
      getRecentJobs(scope, { ...(clientId !== undefined ? { clientId } : {}), limit: 6 }),
      getLatestLanding(scope, clientId),
    ]);
    return JSON.stringify({ jobs, landing });
  }
  if (name === 'get_live_snapshot') {
    // Lê o raio-x já PRONTO do banco (read-only). Filtra por cliente quando dado; senão o mais recente.
    const clientId = clientSlug
      ? ((await getClientBySlug(scope, clientSlug))?.id ?? undefined)
      : undefined;
    const snap = await getLatestSnapshot(scope, clientId);
    return JSON.stringify(
      snap
        ? { status: 'ready', period: snap.period, ...(snap.payload as object) }
        : { status: 'pending' },
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
export async function confirmAndEnqueue(
  scope: AccountScope,
  input: {
    id: string;
    slug: string;
    args: Record<string, string>;
  },
): Promise<ChatResult> {
  const pending = buildPendingAction(input.slug, input.args, { id: input.id });
  if (pending === null) return { reply: 'Ação desconhecida — nada foi enfileirado.' };
  if (!isConfirmation(pending, input.id)) {
    return { reply: 'Confirmação inválida — nada foi enfileirado.' };
  }
  const client = pending.args.client_slug
    ? await getClientBySlug(scope, pending.args.client_slug)
    : null;
  const row = buildAgentJobRow(
    { clientId: client?.id ?? null, accountId: client?.account_id ?? null },
    pending,
  );
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

/**
 * Snapshot ao vivo (Onda 16): a tool request_live_snapshot ENFILEIRA um job read-only (sem
 * confirmação — não muta nada e não gasta) e devolve o jobId para a UI fazer polling. Reusa a
 * allowlist (slug fixo 'live-snapshot') e o montador de linha da fila. NÃO escreve na Meta.
 */
async function requestSnapshot(
  scope: AccountScope,
  tool: AnthropicToolUseBlock,
  leadingText: string,
): Promise<ChatResult> {
  const { client_slug, period } = tool.input;
  const slug = typeof client_slug === 'string' && client_slug ? client_slug : DEFAULT_CLIENT_SLUG;
  const args = { client_slug: slug, ...(typeof period === 'string' ? { period } : {}) };
  const id = globalThis.crypto.randomUUID();
  const pending = buildPendingAction('live-snapshot', args, { id });
  if (pending === null) {
    return { reply: 'Não consegui puxar os números agora.' };
  }
  const client = await getClientBySlug(scope, slug);
  const result = await enqueueJob(
    buildAgentJobRow(
      { clientId: client?.id ?? null, accountId: client?.account_id ?? null },
      pending,
    ),
  );
  return {
    reply: leadingText || 'Deixa eu puxar os números agora…',
    snapshot: { status: result.status, jobId: result.jobId },
  };
}

const MAX_TOOL_ROUNDS = 5;

/**
 * Turno do chat com LOOP agêntico. A cada rodada o modelo pode: usar tools de LEITURA (executadas no
 * servidor; o resultado volta como tool_result e o loop continua), PROPOR uma escrita (enqueue_job →
 * pendência, encerra para confirmação) ou responder texto (encerra). Trata TODOS os tool_use de uma
 * rodada (a Anthropic exige um tool_result por tool_use). Limite de rodadas evita laço infinito.
 */
export async function runChatTurn(
  scope: AccountScope,
  input: {
    message: string;
    history: Turn[];
  },
): Promise<ChatResult> {
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

    // Snapshot ao vivo: enfileira (read-only, sem confirmação) e encerra para a UI fazer polling.
    const snapshot = uses.find((u) => classifyTool(u.name) === 'snapshot');
    if (snapshot) {
      return requestSnapshot(scope, snapshot, text);
    }

    // Caso contrário, executa TODAS as leituras desta rodada e devolve um tool_result por tool_use.
    const results = await Promise.all(
      uses.map(async (u) => ({
        type: 'tool_result' as const,
        tool_use_id: u.id,
        content:
          classifyTool(u.name) === 'read'
            ? await executeReadTool(scope, u.name, u.input)
            : JSON.stringify({ error: 'unknown_tool' }),
      })),
    );
    messages.push({ role: 'assistant', content: resp.content });
    messages.push({ role: 'user', content: results });
  }

  // Esgotou as rodadas sem uma resposta final — devolve o melhor texto que houve.
  return { reply: lastText || 'Não consegui concluir agora — tente de novo.' };
}
