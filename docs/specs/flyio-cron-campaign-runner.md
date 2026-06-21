# SPEC — Runner Fly.io (cron + fila de `agent_jobs`)

- **Onda:** 3
- **Status:** Ready
- ADRs: [[0001-runner-supercronic]], [[0009-agent-jobs-queue]].

## Objetivo

Executar skills headless do Claude Code 24/7, por **cron** (agendadas) e por **fila** (`agent_jobs`),
sem superfície HTTP inbound, com claim atômico, telemetria e idempotência.

## Componentes

| Arquivo | Papel |
|---|---|
| `Dockerfile` | Imagem node:22 + supercronic + Claude Code CLI + wrangler + tsx + python3. |
| `fly.toml` | App `meta-ads-agents`, região gru, **sem serviço HTTP**, volume p/ `/root/.claude`. |
| `crontab` | supercronic: `poll-agent-jobs.sh` a cada minuto; skill de tráfego diária 09:00 UTC. |
| `scripts/poll-agent-jobs.sh` | Lock `mkdir` + `trap`; chama `poll-once.ts`. |
| `scripts/run-skill.sh` | `claude -p ... stream-json` → `tee` log → `emit-from-stream.ts`. |
| `scripts/runner/` (TS) | Lógica testável: validação skill/args, transições de status, mapeamento de eventos, REST. |
| `.claude/hooks/emit-agent-event.py` | Hook PostToolUse **opt-in** (`RUNNER_HOOKS=1`), self-guarding. |

## Contratos

- **Claim atômico:** RPC `claim_agent_job(worker)` (FOR UPDATE SKIP LOCKED). Um job por tick.
- **Transições:** `pending → claimed (RPC) → running → completed|failed`. `exit_code` 0 ⇒ completed.
- **Telemetria:** `agent_events` recebe `start` e `end` garantidos (bookends do runner) + `step` por
  tool-use (do stream-json). **PII-safe:** payload só estrutural (tipo, tool_name, contadores).
- **Segurança:** skill resolvida por **allowlist on-disk** (nunca texto livre); args com **charset
  restrito** (sem metacaracteres de shell); persistência via REST + `SUPABASE_SECRET_KEY` (não MCP).
- **Idempotência/dedup:** índice único parcial de `agent_jobs` (≤1 ativo por client/kind) + claim.

## Operação

Segredos via `fly secrets set` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`,
`CLAUDE_API_KEY`). Login do Claude Code: `fly ssh console` → `claude login` (persistido no volume).
Volume: `fly volumes create claude_oauth --region gru --size 1`.

## Critérios de aceite

- [ ] Job em `agent_jobs` é claimado, executado e marcado `completed`.
- [ ] Cron dispara a skill da Onda 2.
- [ ] `agent_events` recebe `start`/`end`.
- [ ] Jobs duplicados barrados pelo índice único parcial.
- [ ] `lint` + `typecheck` + `test` verdes (lógica do runner testada); `bash -n` nos scripts.
