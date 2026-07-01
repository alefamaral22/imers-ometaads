# SPEC — Credenciais por tenant ativadas (account_id nos jobs + health check de chaves)

- **Onda:** C (super-admin completo — fase de credenciais)
- **Status:** Done
- **Ondas anteriores:** 12 (cofre cifrado por account + resolução de chave no runner), 15 (isolamento de leituras).
- **ADR:** [0033](../adr/0033-account-id-nos-jobs-e-health-check-de-chaves.md). Base: [0027](../adr/0027-segredos-por-tenant-cifrados.md).

## 1. Problema

A Onda 12 construiu a infra de "chaves por tenant" (tabela `api_keys_clientes` cifrada + `resolveTenantKeyEnv`
no runner que resolve a chave do dono do job, ou aborta o tenant pagante sem chave própria). Mas essa infra
estava **dormente** por dois furos:

1. **`agent_jobs.account_id` nunca era preenchido.** `buildAgentJobRow` só setava `client_id`. O runner
   (`poll-once.ts:48`) só resolve a chave do tenant quando `job.accountId` existe → sem ele, **todo job caía
   no caminho super_admin (chaves globais)**, mesmo os de um cliente pagante. A coluna existe desde a Onda 12,
   mas nada a alimentava.
2. **Chaves de provedor nunca eram validadas.** `upsertApiKey` gravava sempre `status = 'unverified'`. O
   cliente colava a chave e não tinha sinal de que ela funcionava — o erro só apareceria no runtime de um job.

## 2. Objetivo

Ativar a infra existente sem migration nem mudança no runner:

- Todo job carrega a **account derivada do cliente** → o runner passa a usar as chaves do tenant certo
  (super_admin segue no caminho global por design — ADR 0027).
- Chave de provedor validada **na escrita** por um probe de auth barato → status real (`active`/`invalid`)
  + `last_validated_at`, e a UI mostra ✓/✗.

## 3. Contratos / modelo de dados

Sem migration. `clientRowSchema` passa a expor `account_id` (coluna já `NOT NULL` desde a Onda 12).
`AgentJobInsert` ganha `account_id: string | null`. `buildAgentJobRow(target, pending, requestedBy?)`
recebe `{ clientId, accountId }` em vez de só `clientId`.

Health check (novos módulos, `web/lib/multitenant/`):
- `provider-health.ts` (puro): `classifyKeyProbe({ ok, httpStatus })` → `ok | auth_error | transient`;
  `statusFromDecision` → `active | invalid | unverified`. `PROBEABLE_PROVIDERS = {anthropic, openai, elevenlabs}`.
- `provider-probe.ts` (server-only): GET de auth barato por provedor (`/v1/models`, `/v1/user`). Rede caída
  → `httpStatus 0` (transitório). A chave nunca é logada.

## 4. Comportamento

- **account_id nos jobs:** os três callers de `buildAgentJobRow` (Nexus `confirmAndEnqueue` e `requestSnapshot`;
  `enqueueCreateLandingJob`) buscam o client e passam `account_id`. Job sem cliente → `accountId: null`
  (no-op no runner, como antes).
- **Health check na escrita:** provedor em `PROBEABLE_PROVIDERS` → probe; `active`/`invalid` gravam
  `last_validated_at`; `transient` mantém `unverified` (não condena chave possivelmente boa). `minimax`/`other`
  (sem probe simples) ficam `unverified` — honesto. Falha do probe **nunca** impede salvar a chave.

## 5. Segurança

- Isolamento de custo (ADR 0027) agora **efetivo**: job de cliente pagante roda com a chave dele ou aborta —
  sem vazar gasto para a global. super_admin inalterado.
- Probe é read-only e server-only; a chave em texto puro só existe no momento da escrita (já era assim para
  cifrar). Nada de novo vai ao browser; a projeção de DISPLAY segue sem `key_cipher`.

## 6. Critérios de aceite

- [x] `buildAgentJobRow` preenche `account_id`; os 3 callers passam a account do cliente.
- [x] `upsertApiKey` valida anthropic/openai/elevenlabs e grava status real + `last_validated_at`.
- [x] UI de chaves mostra ✓ Conectado / ✗ inválida / não verificada.
- [x] `lint` + `typecheck` + `test` verdes (365 testes; +4 do domínio `provider-health`).
