# ADR 0033 — account_id nos agent_jobs + health check das chaves de provedor

- **Status:** Accepted
- **Data:** 2026-07-01
- **Onda:** C (super-admin completo — fase de credenciais)
- **Spec:** `docs/specs/SPEC-credenciais-por-tenant-ativadas.md`

## Contexto

A Onda 12 (ADR [[0027]]) construiu a infra de segredos por tenant: `api_keys_clientes` cifrada,
`ad_account_connections` cifrada, e `resolveTenantKeyEnv` no runner que resolve a chave do dono do job
(super_admin → global; tenant pagante → chave própria ou aborta). Só que essa infra ficou **dormente**:

1. `buildAgentJobRow` preenchia só `client_id`, nunca `account_id`. O runner (`poll-once.ts`) só resolve a
   chave do tenant quando `job.accountId` existe → sem ele, todo job caía no caminho super_admin (global),
   inclusive os de cliente pagante. O isolamento de custo do ADR 0027 não estava efetivo.
2. `upsertApiKey` gravava sempre `status = 'unverified'`. O cliente não tinha sinal de que a chave funciona;
   o erro só apareceria no runtime de um job.

## Decisão

**account_id nos jobs.** `AgentJobInsert` ganha `account_id`; `buildAgentJobRow` recebe `{ clientId, accountId }`.
A account vem do **cliente do job** (`clients.account_id`, já `NOT NULL` desde a Onda 12), resolvido nos três
callers (Nexus `confirmAndEnqueue`/`requestSnapshot`; `enqueueCreateLandingJob`). Job sem cliente → `null`
(no-op no runner). Sem migration — a coluna e o consumo no runner já existiam.

**Health check na escrita.** Provedores com endpoint de auth barato (`anthropic`, `openai`, `elevenlabs`) são
validados por um probe GET no momento do save (`provider-probe.ts`, server-only). O domínio puro
(`provider-health.ts`) classifica: 2xx → `active`, 401/403 → `invalid`, resto (429/5xx/rede) → `transient`
(mantém `unverified`, não condena chave possivelmente boa). `active`/`invalid` gravam `last_validated_at`.
`minimax`/`other` (sem probe simples) ficam `unverified` — honesto. Falha do probe **nunca** impede salvar.

## Consequências

- **Positivas:** isolamento de custo do ADR 0027 passa a valer de fato — job de cliente pagante usa a chave
  dele ou aborta, sem vazar gasto para a global. Cliente vê ✓/✗ na hora de cadastrar a chave.
- **Negativas / trade-offs:** o probe adiciona uma chamada de rede à escrita da chave (aceitável — é rara).
  `minimax` segue sem validação (não há GET de auth barato equivalente); status honesto em vez de falso-verde.
- **Riscos & mitigação:** probe é read-only e server-only, a chave nunca é logada; `transient` evita marcar
  `invalid` por instabilidade momentânea do provedor.

## Alternativas consideradas

- **Denormalizar account_id direto no enqueue via texto livre** — rejeitada: a account tem de vir do cliente
  (fonte da verdade), nunca de entrada do operador/modelo.
- **Validar chave por cron (como as conexões Meta), não na escrita** — adiada: validar na escrita dá feedback
  imediato ao onboarding; um cron de revalidação periódica pode complementar depois.
- **Probe que gasta tokens (ex.: /v1/messages)** — rejeitada: `/v1/models` e `/v1/user` autenticam sem custo
  relevante.
