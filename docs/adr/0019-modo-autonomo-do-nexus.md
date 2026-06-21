# ADR 0019 — Modo autônomo do Nexus como máquina de fases por tick

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 9

## Contexto

Tarefas longas (criar/publicar LP, criar campanha) levam minutos e passam por várias etapas. O operador
não quer ficar olhando. Queremos que o Nexus **acompanhe sozinho** e narre o progresso, mas sem laços
descontrolados, sem narrar a mesma coisa duas vezes, e respeitando o desacoplamento entre planos (o
dashboard não chama o runner; tudo passa pelo banco).

## Decisão

O acompanhamento é uma **máquina de fases** persistida em `autonomous_watches`, avançada **um tick por
vez** pelo runner (cron + `claim_autonomous_watch`, `FOR UPDATE SKIP LOCKED`). Fases:
`watching → reviewing → notifying → done` (ou `failed`). A decisão de cada tick é **pura e
determinística** (`tickWatch`/`planTick` em `scripts/onda9/`, testada): dado o estado + o status do job
observado + o último `agent_events`, produz **no máximo uma narração** e o patch de fase/cursores.

A **idempotência** é por cursores: a narração só é emitida se seu `milestone` difere de
`last_narrated_milestone`. Assim, re-tickar (após um crash entre inserir a narração e patchar a fase)
não duplica narração. O tick é **mecânico** (sem LLM) — `poll-watch-once.ts` apenas executa a decisão
pura. Notificações (email/Telegram) são **fail-safe** (degradam para log).

## Consequências

- **Positivas:** acompanhamento autônomo sem laço solto; ≤1 narração por tick; idempotente sob crash;
  decisão testável sem rede; respeita "planos só falam pelo banco" (cron + claim, sem inbound).
- **Negativas / trade-offs:** latência de até ~1 min por fase (cadência do cron); a narração é
  baseada no estado do job, não numa revisão semântica profunda (essa é o live review, ADR 0020).
- **Riscos & mitigação:** watch órfão → claim com lock + `locked_by` liberado no patch; fase presa →
  fases terminais (`done`/`failed`) não voltam a ser claimadas (índice parcial só pega fases ativas).

## Alternativas consideradas

- **Loop síncrono no dashboard** — rejeitado: o dashboard não fala com o runner; e um loop no servidor
  web seria caro e frágil.
- **Narrar a cada evento** — rejeitado: explosão de narrações; a granularidade por milestone/fase é
  legível e idempotente.
