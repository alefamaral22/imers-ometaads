# ADR 0001 — Runner headless no Fly.io com supercronic + Claude Code CLI

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 3

## Contexto

As skills precisam rodar 24/7, por cron (agendadas) e por fila (`agent_jobs`), sem nenhuma superfície
HTTP inbound (SPEC §1/§3: planos só falam pelo banco). É preciso executar `claude -p` headless, com
claim atômico sob concorrência, telemetria em `agent_events`, e idempotência/dedup. O ambiente do
runner difere do dashboard (Vercel) — é um processo de longa duração com cron.

## Decisão

Um **runner headless no Fly.io** empacotado em Docker (`node:22`), com **supercronic** lendo um
`crontab` como processo principal (`tini` como PID 1 para reap dos filhos). Sem `[http_service]` no
`fly.toml` → **nenhuma porta exposta**. As credenciais OAuth do Claude Code persistem num **volume**
montado em `/root/.claude`.

- `poll-agent-jobs.sh` (1×/min): **lock por `mkdir`** (atômico) + `trap` de liberação; delega a
  `scripts/runner/poll-once.ts`.
- `poll-once.ts` (TS, testado): **claim atômico** via RPC `claim_agent_job` (FOR UPDATE SKIP LOCKED) →
  valida skill (allowlist on-disk) + args (charset seguro) → `running` → executa → `completed/failed`,
  com eventos `start/end` garantidos em `agent_events`.
- `run-skill.sh`: roda `claude -p --dangerously-skip-permissions --output-format stream-json`, faz
  `tee` de log e canaliza o stream para `scripts/runner/emit-from-stream.ts` (mapeia → `agent_events`).
- A **lógica crítica é TypeScript testável** (`scripts/runner/domain` + `infrastructure`, via `tsx`);
  o bash é só orquestração (cron + lock + pipe). Desvio consciente do SPEC, que sugeria
  `emit-from-stream.py` em Python: optou-se por TS para ter cobertura no gate (lint/typecheck/test) e
  um só runtime no caminho quente. O hook opcional `emit-agent-event.py` (Python stdlib) permanece
  como telemetria fina **opt-in** (`RUNNER_HOOKS=1`), self-guarding para não afetar dev interativo.

## Consequências

- **Positivas:** sem superfície inbound; concorrência segura (lock + claim); telemetria testável;
  credenciais persistentes; dedup pela fila ([[0009-agent-jobs-queue]]).
- **Negativas / trade-offs:** o runner é um ponto que precisa estar de pé; cobertura de testes não
  cobre o glue bash/Docker (validados por `bash -n` e build de imagem, não por unit).
- **Riscos & mitigação:** job malicioso/duplicado → claim atômico + índice único parcial + validação
  de skill/args; crash no meio do job → `trap` libera lock e o status fica `running` até reprocesso
  (reconciliação futura na Onda 11).

## Alternativas consideradas

- **cron do sistema (cronie) como root** — rejeitado: supercronic é feito p/ containers (loga em
  stdout, roda sem root).
- **Broker/worker dedicado (BullMQ/QStash) p/ a fila** — rejeitado: segundo canal/infra; a tabela
  `agent_jobs` + `claim_agent_job` já dão claim atômico ([[0009-agent-jobs-queue]]).
- **Runner inteiro em bash/Python** — rejeitado: lógica não testável no gate do projeto.
