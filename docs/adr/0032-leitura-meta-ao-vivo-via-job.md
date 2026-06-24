# 0032 — Leitura Meta "ao vivo" para o Nexus via job read-only (não via MCP no dashboard)

- **Status:** Aceito
- **Data:** 2026-06-24
- **Onda:** 16
- **Relacionados:** ADR 0009 (fila `agent_jobs`), 0025 (funil), 0026 (multi-tenancy), 0031
  (isolamento das leituras), SPEC-016.

## Contexto

O protótipo Jarvis responde perguntas sobre campanhas lendo a Graph API **ao vivo, no turno do chat**.
Queremos a mesma capacidade no Nexus. Mas a arquitetura deste projeto é deliberadamente desacoplada:

- O **dashboard** (Next/Vercel) só conversa com a API da Anthropic e **lê o Supabase**. Ele **não
  roda `claude -p`** e **não tem cliente MCP**.
- A **Meta só é acessada via MCP `mcp-meta-ads`**, que hoje vive **apenas no runner** (Fly.io), onde o
  `claude -p` o dirige com `allowed-tools` de least privilege. **Não há token Meta em env** (regra
  inviolável do projeto).

Dar leitura ao vivo "via MCP no dashboard" exigiria abrir uma **nova superfície Meta no plano do
dashboard** (cliente MCP + credencial no Vercel), quebrando o isolamento dos planos e a regra de
segredos.

## Decisão

A leitura Meta ao vivo do Nexus é feita por um **job read-only** (`kind = 'snapshot'`), não por acesso
Meta direto no dashboard:

1. O Nexus enfileira um job `live-snapshot` (sem confirmação — é read-only, não liga gasto).
2. O **runner** executa a skill via MCP (o acesso que já existe), calcula um snapshot compacto
   (métricas + alertas) e grava **uma linha** em `live_snapshots`.
3. O dashboard **lê o snapshot do Supabase** (escopado por account) e o Nexus narra.

Mantemos o desacoplamento: comunicação entre planos **só pelo banco** (fila + leitura), nada de
inbound novo ao runner, nenhum token Meta no dashboard.

## Alternativas consideradas

- **A. Cliente MCP no Next.** Mais próximo do Jarvis (resposta instantânea), mas adiciona credencial
  Meta no Vercel e uma superfície Meta no plano isolado. **Rejeitado** por violar segredos/isolamento.
- **B. Endpoint REST read-only no runner.** Reusa o MCP do runner sem token novo, mas cria um fluxo
  **inbound** ao runner (hoje só polling), aumentando superfície e acoplamento. **Adiado** como
  evolução possível se a latência da fila incomodar.
- **C (escolhida). Job read-only + poll do banco.** Zero superfície nova, 100% dentro das regras.

## Consequências

**Positivas:** não abre acesso Meta no dashboard; reusa fila/runner/MCP e o padrão de least privilege
das skills; idempotente e auditável; a escrita derivada continua com confirmação em dois turnos.

**Negativas / trade-offs:** a resposta **não é instantânea** — passa pela fila + polling (segundos,
não milissegundos). Mitigação: snapshot compacto (período curto, payload enxuto) e timeout amigável no
poll. Se a latência se tornar um problema de UX, evoluir para a alternativa **B**.
