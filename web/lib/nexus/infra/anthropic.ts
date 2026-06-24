import 'server-only';
import { NEXUS_DEFAULT_MODEL, serverEnv } from '../../env';
import type { NexusToolDef } from '../domain/tools';

/**
 * Cliente mínimo da Anthropic Messages API via fetch (sem SDK → sem nova dependência). Server-only:
 * a CLAUDE_API_KEY nunca vai ao browser. Degrada com erro claro se a chave faltar.
 */

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}
export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[] | unknown[];
}

export interface AnthropicResponse {
  stop_reason: string | null;
  content: AnthropicContentBlock[];
}

export class NexusUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NexusUnavailableError';
  }
}

// Erros transitórios da Anthropic que valem retry (sobrecarga/limite/instabilidade momentânea).
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callMessages(args: {
  system: string;
  messages: AnthropicMessage[];
  tools: NexusToolDef[];
  maxTokens?: number;
}): Promise<AnthropicResponse> {
  const env = serverEnv();
  if (!env.CLAUDE_API_KEY) {
    throw new NexusUnavailableError('CLAUDE_API_KEY ausente — chat do Nexus indisponível');
  }
  const body = JSON.stringify({
    model: env.NEXUS_MODEL ?? NEXUS_DEFAULT_MODEL,
    max_tokens: args.maxTokens ?? 1024,
    system: args.system,
    tools: args.tools,
    messages: args.messages,
  });

  let lastDetail = '';
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body,
      });
    } catch (err) {
      // Falha de rede (DNS/TLS/timeout): vale retry enquanto houver tentativa.
      lastStatus = 0;
      lastDetail = err instanceof Error ? err.message : 'network error';
      if (attempt < MAX_ATTEMPTS) {
        await sleep(250 * attempt);
        continue;
      }
      break;
    }
    if (res.ok) {
      const json = (await res.json()) as {
        stop_reason?: string;
        content?: AnthropicContentBlock[];
      };
      return { stop_reason: json.stop_reason ?? null, content: json.content ?? [] };
    }
    lastStatus = res.status;
    lastDetail = (await res.text().catch(() => '')).slice(0, 300);
    // 4xx não-transitório (ex.: 400/401) não melhora com retry → falha já.
    if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) break;
    await sleep(250 * attempt);
  }
  // Erros transitórios esgotados viram "indisponível" (503 amigável), não um 500 cru.
  if (lastStatus === 0 || RETRYABLE_STATUS.has(lastStatus)) {
    throw new NexusUnavailableError(`Anthropic instável (${lastStatus || 'rede'}) — tente de novo`);
  }
  throw new Error(`Anthropic ${lastStatus}: ${lastDetail}`);
}
