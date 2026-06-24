# SPEC — Snapshot ao vivo da Meta para o Nexus (perna leve do híbrido)

- **Onda:** 16
- **Status:** Draft

## Objetivo

Dar ao Nexus a capacidade de responder **na hora** perguntas sobre o estado atual das campanhas
("como estão minhas campanhas agora?", "tem algum alerta?", "qual está queimando dinheiro?") — hoje
ele só lê do banco o que uma análise anterior gravou. Inspirado no protótipo Jarvis, que lê a Meta ao
vivo, mas **adaptado às regras deste projeto**: o dashboard continua **sem acesso direto à Meta** e
**sem token Meta em env**; a leitura ao vivo é feita por um **job read-only** que o runner executa via
MCP (que já tem o acesso), gravando um snapshot compacto que o dashboard lê e o Nexus narra.

Esta é a **perna leve** do modelo híbrido. A **perna pesada** (análise de funil completa) continua
sendo o job `analyze` (skill `funnel-analytics-cliente-exemplo-campaign`), inalterado.

## Contratos / modelo de dados

### Enum
- `public.job_kind += 'snapshot'` (migration nova). Read-only por natureza (não liga gasto).

### Allowlist (server-side, Nexus)
- Novo slug `live-snapshot` → skill `live-snapshot-cliente-exemplo`, kind `snapshot`
  (`web/lib/nexus/domain/allowlist.ts`).

### Tabela `public.live_snapshots`
| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `account_id` | uuid FK | tenant (multi-tenant, ADR 0026) |
| `client_id` | uuid FK | |
| `job_id` | uuid **unique** | idempotência: 1 snapshot por job |
| `period` | text | preset Meta (`last_7d` default) |
| `payload` | jsonb | métricas compactas + alertas (ver shape) |
| `created_at` | timestamptz default now() | |

- **RLS deny-by-default** (ligada pelo trigger `rls_auto_enable`); só `service_role`. Leitura no
  dashboard é server-side e **escopada por account** (`scopeEq`/`clientScopeFilter`, ADR 0031).

### Shape do `payload` (dado de fronteira — validado por Zod no servidor)
```jsonc
{
  "conta": "Cliente Exemplo", "moeda": "BRL", "period": "last_7d",
  "campanhas": [{
    "id": "1234", "nome": "...", "entrega": "ACTIVE",
    "gasto_cents": 12000, "ctr": 1.8, "cpc_cents": 230, "freq": 2.1,
    "resultados": 14, "custo_por_resultado_cents": 857  // null = sem dado
  }],
  "alertas": [{ "nivel": "CRÍTICO"|"ATENÇÃO", "campanha": "...", "id": "1234", "alerta": "..." }]
}
```
Dinheiro **sempre em centavos inteiros**; "sem dado" é **null**, nunca 0. **Sem PII** (só métricas
agregadas e dimensões).

### Tools do Nexus (`web/lib/nexus/domain/tools.ts`)
- `request_live_snapshot(client_slug, period?)` — **não** é escrita-na-Meta: enfileira um job
  read-only. Classificada como `snapshot` (novo `classifyTool`), **sem** confirmação em dois turnos
  (não há gasto). Retorna `{ job_id, status: 'pending' }`.
- `get_live_snapshot(client_slug, job_id?)` — leitura server-side da última `live_snapshots` do
  cliente (ou da do `job_id`). Retorna o payload ou `{ status: 'pending' }`.

### Endpoint
- `GET /api/nexus/snapshot?jobId=<uuid>` — gated igual `/api/nexus/*` (super_admin/socio), rate-limited.
  Lê `live_snapshots` por `job_id` **escopado por account**. 404 deny-by-default fora do escopo.

### Skill `live-snapshot-cliente-exemplo` (headless, runner)
- `allowed-tools`: só leitura/insights da Meta (`ads_get_*`, `ads_insights_*`) — **mesma least
  privilege** da funnel-analytics. **Nenhuma** tool de escrita disponível.
- Reusa a lógica pura de alertas portada do Jarvis (`scripts/onda16/domain/alerts.ts`, testável).
- Persiste **uma** linha em `live_snapshots` via REST + `SUPABASE_SECRET_KEY` (nunca MCP do Supabase).

## Comportamento

1. **Intenção de status ao vivo** ("como estão as campanhas agora", "tem alerta?"): Nexus chama
   `request_live_snapshot` → servidor enfileira o job (`snapshot`), devolve `job_id`. Nexus dá um
   ack curto e natural ("Deixa eu puxar os números agora…").
2. **Runner** executa a skill: lê insights read-only, calcula métricas + alertas, grava
   `live_snapshots` (idempotente por `job_id`).
3. **UI** faz polling de `GET /api/nexus/snapshot?jobId` (intervalo curto, com timeout ~20s e
   rate-limit) até o snapshot existir.
4. **Narração**: ao ficar pronto, a UI envia um turno de follow-up com o payload como contexto; o
   Nexus narra **assertivo** (regras "COMO ANALISAR": melhor/pior + 1 recomendação com número) e, se
   couber, **propõe uma ação** (pausar/ajustar) via `enqueue_job` — aí sim com confirmação em 2 turnos.
5. **Timeout/erro**: se não ficar pronto a tempo, Nexus avisa em uma frase ("os números demoraram,
   tenta de novo em instantes") — degrada sem travar.

**Idempotência:** `unique(job_id)` + upsert; re-rodar o mesmo job não duplica. Polling é leitura pura.

## Segurança

- **Meta fica fora do dashboard**: nenhum token Meta novo no Vercel; o acesso continua só no runner
  via MCP (least privilege, só read). Mantém o isolamento dos planos (ver ADR 0032).
- **Ordem em rota protegida** (`/api/nexus/snapshot`): auth → authz (super_admin/socio) → validação
  (Zod no `jobId`) → leitura escopada por account.
- **`request_live_snapshot` não confirma** porque é read-only (sem gasto); toda **escrita** derivada
  (pausar/ajustar) continua passando pela confirmação em dois turnos com token exato.
- Números da Meta = **dado de fronteira**: payload validado por Zod; texto de insights nunca tratado
  como instrução (anti prompt-injection).
- **Sem PII** em `live_snapshots` nem em logs. Dinheiro em centavos. RLS deny-by-default.
- Threat model STRIDE: `docs/security/threats/nexus-live-snapshot.md`.

## Critérios de aceite

- [ ] Migration cria `live_snapshots` (RLS on) e adiciona `'snapshot'` ao enum `job_kind`.
- [ ] Slug `live-snapshot` resolve no allowlist; `classifyTool('request_live_snapshot') === 'snapshot'`.
- [ ] `request_live_snapshot` enfileira **sem** confirmação; nenhuma tool de escrita-na-Meta criada.
- [ ] Skill é read-only na Meta (allowed-tools só `ads_get_*`/`ads_insights_*`); grava 1 snapshot
      idempotente por `job_id`.
- [ ] `GET /api/nexus/snapshot` é gated, rate-limited e escopado por account (404 fora do escopo).
- [ ] Lógica de alertas portada do Jarvis coberta por testes unitários (limiares: freq, CTR, CPC,
      custo/resultado, problema de entrega).
- [ ] Nexus narra assertivo a partir do payload e propõe ação com confirmação quando couber.
- [ ] `lint` + `typecheck` + `test` verdes.
