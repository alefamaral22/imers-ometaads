/**
 * Nexus — catálogo de tools (SPEC-000 §10). Duas classes:
 *  - LEITURA (direta): retorna JSON do banco; não muta nada.
 *  - ESCRITA (enqueue): só PROPÕE uma ação pendente por SLUG (allowlist) → confirmação em dois turnos.
 * As definições seguem o formato de tools da API de mensagens da Anthropic. Pura, sem I/O.
 */

import { listJobSlugs } from './allowlist';

export type ToolClass = 'read' | 'write' | 'snapshot';

export interface NexusToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Tools de leitura — executadas direto no servidor, retornam JSON puro (read-only).
export const READ_TOOLS: NexusToolDef[] = [
  {
    name: 'get_clients',
    description:
      'Lista os clientes cadastrados e suas CONTAS DE ANÚNCIO da Meta (slug, nome, ad_account_id, ' +
      'moeda, teto de orçamento diário). Use para saber quais contas a agência opera.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_campaigns',
    description:
      'Lista as campanhas registradas no banco da agência (nome, objetivo, status PAUSED/ACTIVE, ' +
      'orçamento diário em centavos, meta_campaign_id). Opcional: client_slug para filtrar por cliente.',
    input_schema: {
      type: 'object',
      properties: { client_slug: { type: 'string', description: 'slug do cliente (opcional)' } },
    },
  },
  {
    name: 'get_analyses',
    description: 'Lista as análises recentes (veredito, objetivo, janela). Opcional: client_slug.',
    input_schema: {
      type: 'object',
      properties: { client_slug: { type: 'string', description: 'slug do cliente (opcional)' } },
    },
  },
  {
    name: 'get_funnel',
    description: 'Retorna o funil de 7 etapas da análise mais recente (contagens e CVR por etapa).',
    input_schema: { type: 'object', properties: {} },
  },
];

// Tool de escrita — NÃO age: enfileira via slug, com confirmação em dois turnos.
export const WRITE_TOOLS: NexusToolDef[] = [
  {
    name: 'enqueue_job',
    description:
      'Propõe enfileirar uma skill para o runner executar. NÃO executa: requer confirmação do operador. ' +
      `O parâmetro slug deve ser um destes valores canônicos: ${listJobSlugs().join(', ')}.`,
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'slug canônico da skill (allowlist)' },
        client_slug: { type: 'string', description: 'slug do cliente alvo' },
        campaign_id: { type: 'string', description: 'uuid da campanha (para activate)' },
        product_slug: { type: 'string' },
        subdomain: { type: 'string' },
        landing_page_id: { type: 'string' },
      },
      required: ['slug'],
    },
  },
];

// Tools de snapshot ao vivo (Onda 16) — leitura Meta AO VIVO via job read-only. request_* enfileira
// um job (sem confirmação: não muta nada e não gasta); get_* lê o resultado já pronto do banco.
export const SNAPSHOT_TOOLS: NexusToolDef[] = [
  {
    name: 'request_live_snapshot',
    description:
      'Pede um raio-x AO VIVO das campanhas (métricas atuais + alertas) direto da Meta. Dispara uma ' +
      'leitura read-only — NÃO muda nada e NÃO gasta, então não precisa de confirmação. Use quando o ' +
      'operador perguntar o estado AGORA ("como estão minhas campanhas?", "tem algum alerta?"). ' +
      'Retorna um job_id; o resultado fica pronto em instantes (leia depois com get_live_snapshot).',
    input_schema: {
      type: 'object',
      properties: {
        client_slug: { type: 'string', description: 'slug do cliente (opcional se houver só um)' },
        period: { type: 'string', description: 'janela: last_7d (padrão), last_14d, last_30d' },
      },
    },
  },
  {
    name: 'get_live_snapshot',
    description:
      'Lê o raio-x ao vivo já PRONTO (métricas por campanha + alertas) do banco. Use para narrar os ' +
      'números depois que o snapshot ficou disponível. Se ainda não estiver pronto, retorna status pending.',
    input_schema: {
      type: 'object',
      properties: {
        client_slug: { type: 'string', description: 'slug do cliente (opcional)' },
        job_id: {
          type: 'string',
          description: 'job_id do snapshot (opcional; senão pega o mais recente)',
        },
      },
    },
  },
];

export const ALL_TOOLS: NexusToolDef[] = [...READ_TOOLS, ...WRITE_TOOLS, ...SNAPSHOT_TOOLS];

const READ_NAMES = new Set(READ_TOOLS.map((t) => t.name));
const WRITE_NAMES = new Set(WRITE_TOOLS.map((t) => t.name));
// get_live_snapshot é leitura do banco (classe 'read'); só request_live_snapshot enfileira ('snapshot').
const SNAPSHOT_NAMES = new Set(['request_live_snapshot']);

export function classifyTool(name: string): ToolClass | null {
  if (name === 'get_live_snapshot') return 'read'; // lê o snapshot pronto no banco
  if (READ_NAMES.has(name)) return 'read';
  if (WRITE_NAMES.has(name)) return 'write';
  if (SNAPSHOT_NAMES.has(name)) return 'snapshot';
  return null; // tool desconhecida → ignorada (deny-by-default)
}
