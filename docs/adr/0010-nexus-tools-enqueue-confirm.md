# ADR 0010 — Nexus: tools de escrita só enfileiram, com confirmação em dois turnos e allowlist slug→skill

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 7

## Contexto

O Nexus é um assistente conversacional (voz/texto) que pode pedir operações que **gastam dinheiro**
(criar/ativar campanha) ou são caras (analisar, publicar LP). O conteúdo da fala e da tela é entrada
não confiável — um operador (ou um texto na tela) poderia, por engano ou injeção, tentar disparar uma
ação destrutiva. Precisamos que o Nexus **nunca** execute uma escrita diretamente nem invente o nome de
uma skill a partir de texto livre.

## Decisão

Três camadas, todas em lógica pura testada (`web/lib/nexus/domain/`):

1. **Allowlist server-side slug→skill** (`resolveJobSlug`): o modelo só conhece SLUGS canônicos
   (`create-traffic`, `activate`, `analyze`, …). O servidor mapeia o slug para o nome real da skill e o
   `kind` da fila. Slug fora da allowlist → `null` (deny-by-default). Texto livre nunca vira skill.
2. **Tools de escrita só PROPÕEM** (`enqueue_job`): a tool não age — produz uma `PendingAction`
   (turno 1). Nenhum job é inserido nesse momento.
3. **Confirmação em dois turnos** (`isConfirmation`): a execução (enfileirar em `agent_jobs`) só ocorre
   quando chega uma confirmação que cita o `id` exato (token) da pendência (turno 2). Não existe
   `confirm=true` livre; o token é comparado em tempo constante.

Os args do job passam por **charset restrito** (`parseJobArgs`: só chaves de uma allowlist, valores sem
metacaracteres de shell). A inserção (`enqueueJob`) trata o conflito do índice único parcial (ADR 0009)
como "já enfileirado". As tools de **leitura** são diretas e retornam JSON do banco (read-only).

## Consequências

- **Positivas:** impossível disparar escrita sem confirmação explícita; nome de skill nunca vem de
  texto livre; injeção na fala/tela é dado, não instrução; toda a decisão é determinística e testável
  (18 testes), independente do LLM.
- **Negativas / trade-offs:** o operador precisa de um segundo toque (confirmar) — fricção proposital
  em operações que gastam; o catálogo de slugs precisa ser mantido ao adicionar skills.
- **Riscos & mitigação:** prompt injection → conteúdo é dado + allowlist + confirmação; replay de token
  → o token é efêmero (uuid por proposta) e a idempotência da fila barra duplicatas.

## Alternativas consideradas

- **Nexus executa a skill direto** — rejeitado: dá ao LLM poder de gasto sem trava humana.
- **Confirmação por `confirm:true` no mesmo turno** — rejeitado: um texto/injeção poderia setar a flag;
  o token de dois turnos exige uma ação humana deliberada citando a pendência específica.
