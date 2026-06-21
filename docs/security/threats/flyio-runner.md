# Threat model (STRIDE) — Runner Fly.io (Onda 3)

Superfície: runner headless que faz polling de `agent_jobs`, executa `claude -p` e grava em
`agent_events`/`agent_jobs` via REST com `service_role`. **Sem porta inbound** (SPEC §1/§3).

## Ativos
- `SUPABASE_SECRET_KEY` (service_role, bypassa RLS), credenciais OAuth do Claude (volume), `OPENAI_API_KEY`.
- Integridade da fila e da telemetria; isolamento entre clientes.

## STRIDE

| Categoria | Ameaça | Mitigação |
|---|---|---|
| **S**poofing | Worker falso reivindicando jobs | Sem inbound; só quem tem `SUPABASE_SECRET_KEY` chama a RPC; `claimed_by` registra o worker. |
| **T**ampering | Job com `skill`/`args` maliciosos (injeção via fila) | Skill resolvida por **allowlist on-disk** (regex + diretório existe); `args` com **charset restrito** (sem `;`,`|`,`$`,`` ` ``,`&`,`<`,`>`,aspas); nunca interpolados como código. |
| **R**epudiation | Não saber o que rodou | `agent_events` (start/step/end) por `run_id`=job; `operation_logs` por mutação (skills); logs `tee` em `/app/logs`. |
| **I**nformation disclosure | PII/segredo em telemetria ou logs | Payload de evento só estrutural (tipo/tool_name/contadores), **nunca** texto/inputs; segredos só em env/`fly secrets`, jamais no diff; `error` truncado e sem conteúdo da skill. |
| **D**enial of service | Jobs concorrentes/duplicados, loop de falhas | Lock `mkdir` (1 execução/tick) + `claim_agent_job` (FOR UPDATE SKIP LOCKED) + índice único parcial (≤1 ativo por client/kind); `attempts` contabiliza retentativas. |
| **E**levation of privilege | Skill de leitura ganhando escrita; RPC aberta | Least privilege: `EXECUTE` das RPCs revogado de anon/authenticated (só `service_role`); allowed-tools por skill; runner sem superfície inbound. |

## Riscos residuais
- Crash no meio do job deixa status `running` (sem reconciliação automática até a Onda 11).
- `--dangerously-skip-permissions` é necessário no headless: mitigado por rodar só skills da allowlist
  on-disk e args saneados, em máquina isolada sem inbound.
- Hook Python opt-in (`RUNNER_HOOKS=1`) também posta via REST: self-guarding (no-op sem `AGENT_RUN_ID`),
  payload sem PII.
