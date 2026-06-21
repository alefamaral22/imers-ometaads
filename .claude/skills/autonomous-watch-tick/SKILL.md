---
name: autonomous-watch-tick
description: Avança UM tick de um watch autônomo do Nexus — claim de um watch ativo, lê o status do job observado e o último evento, decide a próxima fase (máquina watching→reviewing→notifying→done) e insere ≤1 narração. Determinístico e idempotente por cursores. Headless.
allowed-tools: Read, Bash(npx tsx:*)
---

# autonomous-watch-tick

Tick **mecânico** (sem LLM) do modo autônomo do Nexus. A decisão é **determinística** e vive em
`scripts/onda9/` (testada): a skill apenas a executa contra o banco via REST + `SUPABASE_SECRET_KEY`
(nunca o MCP do Supabase). Ver ADR 0019 (modo autônomo) e ADR 0020 (live review).

## Regras invioláveis

- **≤1 narração por tick**; idempotente por cursores (`last_narrated_milestone`): re-tickar não duplica.
- Fases: `watching → reviewing → notifying → done` (ou `failed`). `done/failed` são terminais.
- Notificações (email/Telegram) são **fail-safe**: degradam para log, nunca derrubam o tick.
- Sem PII em `nexus_narrations` (só texto de status/opinião do agente).

## Como executar

O poller `scripts/poll-autonomous-watches.sh` (supercronic) faz o lock e chama o orquestrador:

```bash
npx tsx scripts/runner/poll-watch-once.ts
```

que: `claim_autonomous_watch` → lê `agent_jobs.status` + último `agent_events` do run → `planTick`
(`scripts/onda9/application/tick-plan.ts`) → insere a narração (se houver) em `nexus_narrations` →
patcha `autonomous_watches` (fase + cursores, libera `locked_by`).

Opcional (live review): `node scripts/screenshot-page.cjs <https://*.example.com> out.png` (SSRF-guard)
e `node scripts/send-email.cjs "<assunto>" "<corpo>"` (Resend, degrada para log).

## Critérios de aceite

Cada tick insere **≤1 `nexus_narrations`** e avança a fase do watch; repetir o tick não duplica
narração; fases terminais não narram.
