# SPEC — Painel Super Admin completo (Etapa 1)

- **Status:** Draft
- **Onda:** feature/super-admin-completo
- **Ondas anteriores:** 12 (SaaS multi-tenant), 13 (login por account), 14 (provisionamento —
  [`SPEC-provisionamento-accounts.md`](./SPEC-provisionamento-accounts.md), [ADR 0030](../adr/0030-provisionamento-accounts-super-admin.md)),
  A (planos — [[plans-module-done-pr1]]), C (credenciais por tenant ativadas —
  [`SPEC-credenciais-por-tenant-ativadas.md`](./SPEC-credenciais-por-tenant-ativadas.md)).
- **ADR relacionado:** [0035](../adr/0035-meta-token-por-tenant-substitui-mcp-na-escrita.md) — Meta
  via token por tenant substitui o MCP compartilhado na escrita de campanhas.

## 1. Problema

O super_admin hoje só tem uma listagem plana de accounts (`/accounts`) e uma tela de credenciais
genérica (`/settings`) que pede a conta a cada submit. Não existe: visão agregada de uma empresa
específica, distinção visual entre trial/ativo/bloqueado, dashboard de negócio (quantos clientes,
quantos em trial, quantos sem credenciais, planos vencendo), separação entre "minhas chaves"
(operador da agência) e "chaves do cliente", nem onboarding guiado pós-cadastro. Além disso, a
criação de campanha Meta hoje depende de um único MCP compartilhado da agência — sem isolamento de
conta de anúncio por cliente.

## 2. Decisões de arquitetura (fechadas com o usuário em 2026-07-02)

1. **Meta Ads passa a usar token de API por cliente** (System User), cifrado em
   `ad_account_connections`, decifrado só server-side no instante da chamada REST à Graph/Marketing
   API. **Um cliente pode ter múltiplos tokens/contas de anúncio.** O MCP compartilhado deixa de ser
   usado para escrita de campanha (ADR 0035); segue só para leitura ao vivo do Nexus (ADR 0032).
2. **Escolha da conta de anúncio é sempre explícita por job** — quando há múltiplas conexões para o
   mesmo cliente, o job precisa informar qual `meta_ad_account_id` usar. Sem isso, a skill aborta.
   Nunca fallback implícito (conexão "padrão" ou "mais recente").
3. **Onboarding guiado exige teste de conexão real só para Anthropic/OpenAI/ElevenLabs**
   (provedores já cobertos por `provider-probe.ts`, Onda C). Meta e Minimax entram como
   "salvar e validar depois" — Meta é validado de forma assíncrona pelo cron `validate-connections`
   já existente; Minimax fica `unverified` até haver probe (fora de escopo desta etapa).

## 3. Objetivo (vertical slice desta etapa)

1. **Página de detalhe de empresa** `/accounts/[id]` — agrega plano atual + histórico
   (`plan_changes`), datas (`trial_ends_at`, `current_period_end`, `last_login_at`), status de
   assinatura, credenciais cifradas da conta (`api_keys_clientes`), e **todas** as conexões Meta da
   conta (`ad_account_connections`, podendo ser mais de uma), mascaradas por `last4`.
2. **Status visual trial/ativo/bloqueado** — expõe `subscription_status` (já existe na tabela e no
   `accountRowSchema`, só não é lido) como badge, tanto em `/accounts` (listagem) quanto em
   `/accounts/[id]`.
3. **Dashboard de negócio do super admin** — nova rota `/admin/business`: contas ativas vs trial vs
   bloqueadas, planos vencendo em 7 dias, contas sem nenhuma credencial cadastrada, log de atividade
   recente (`operation_logs`).
4. **Tela "minhas chaves" do operador** — nova rota `/admin/my-keys`, escopada à account do próprio
   operador logado (sem select de conta), separada visualmente das chaves de tenant em `/settings`.
5. **Onboarding guiado pós-cadastro** — wizard em `/accounts/[id]/onboarding`: Anthropic → OpenAI →
   ElevenLabs → Meta (token manual, múltiplas conexões permitidas, sem probe síncrono) → Minimax
   (manual, sem probe). Reaproveita `ApiKeyForm`/`ConnectionForm` adaptados para `accountId` fixo.
6. **Meta via REST com token do tenant** — a skill de criação de campanha passa a resolver a conexão
   pelo `meta_ad_account_id` informado no job (não mais MCP compartilhado). UI de conexões permite
   cadastrar N conexões por conta, cada uma com seu `token_label` para o operador identificar qual é
   qual.

**Fora de escopo desta etapa**: hard-delete de account, redefinir senha pelo admin, impersonar
cliente, SMTP transacional, OAuth oficial da Meta (fase 2 do ADR 0028, ainda gated por App Review),
probe síncrono para Meta/Minimax.

## 4. Contratos / modelo de dados

**Sem migration.** Todas as colunas necessárias já existem:
`accounts.subscription_status`, `accounts.trial_ends_at`, `accounts.current_period_end`,
`accounts.plan_id`, `plan_changes`, `api_keys_clientes`, `ad_account_connections` (já suporta N
linhas por `account_id`, só é único por `meta_ad_account_id` entre conexões vivas).

Mudanças de código:
- `web/lib/domain/schemas.ts`: `accountRowSchema`/`ACCOUNT_DISPLAY_COLUMNS` passam a incluir
  `trial_ends_at` e `current_period_end` (ambos `ts.nullable()`).
- `web/lib/services/accounts.ts`: nova função `getAccountDetail(id)` — busca a account + plano
  associado + `listPlanChanges` + chaves (`api_keys_clientes`) + **todas** as conexões Meta
  (`listConnectionsByAccount(accountId)`, não só a mais recente).
- `web/lib/services/admin-metrics.ts` (novo): agregações puras de leitura para o dashboard de
  negócio (contagens por `subscription_status`, contas com vencimento em 7 dias, contas sem
  credenciais).
- `ApiKeyForm`/`ConnectionForm`: prop `accountId` passa a aceitar modo "fixo" (sem `<select>`) via
  prop opcional (`fixedAccountId?: string`).
- **`scripts/onda2/infrastructure/meta-graph-client.ts` (novo):** cliente REST para
  `graph.facebook.com` — `createCampaign`, `createAdSet`, `createCreative`, `createAd`, recebendo o
  token decifrado como parâmetro (nunca lido de env).
- **Job de criação de campanha** ganha campo obrigatório `metaAdAccountId` no payload enfileirado;
  a skill busca a conexão correspondente em `ad_account_connections` por
  `(account_id, meta_ad_account_id)`, decifra o token (`decryptConnectionToken`, já existente em
  `scripts/onda12/infrastructure/secrets-rest.ts`) e chama o cliente REST novo. Sem conexão
  encontrada ou status `invalid`/`revoked` → aborta antes de qualquer escrita na Meta.

## 5. Autorização

Segue o padrão já estabelecido (app-layer, não RLS — ADR 0026/0030):
- `/accounts/[id]`, `/admin/business`: `requireRole(['super_admin', 'socio'])` (leitura); mutações
  (assign plan, salvar credencial, cadastrar conexão Meta) exigem `super_admin` estrito.
- `/admin/my-keys`: `requireOperator()` — qualquer papel autenticado só vê/edita a própria conta.
- Onboarding wizard: mesma authz de `/accounts/[id]` (mutação = `super_admin`).

## 6. Segurança

- Nenhuma chave/token em texto puro chega ao browser em nenhuma tela — sempre `last4` mascarado.
- Token Meta decifrado só existe em memória do runner, no instante da chamada REST — nunca em log,
  nunca em `operation_logs`, nunca em manifest.
- Escolha de `meta_ad_account_id` sempre explícita por job (ADR 0035) — elimina risco de campanha
  criada na conta de anúncio errada quando o cliente tem múltiplas conexões.
- Onboarding só valida sincronamente os 3 provedores com probe existente; Meta/Minimax não abrem
  chamada de rede síncrona nova a partir do dashboard.
- Dashboard de negócio não expõe PII de clientes finais — só metadados de conta.
- Threat model novo em `docs/security/threats/meta-token-por-tenant-escrita.md` cobrindo o novo
  vetor de escrita real via REST (antes só leitura de saúde).

## 7. Critérios de aceite

- [ ] `subscription_status` visível como badge em `/accounts` e `/accounts/[id]`.
- [ ] `/accounts/[id]` renderiza plano atual, histórico de `plan_changes`, credenciais mascaradas e
      **todas** as conexões Meta da conta (não só uma), sem expor segredo em texto puro.
- [ ] `/admin/business` mostra contagens corretas (ativos/trial/bloqueados, vencendo em 7 dias, sem
      credenciais) — testado com dados determinísticos (fixture).
- [ ] `/admin/my-keys` só afeta a própria conta do operador logado.
- [ ] Onboarding wizard salva Anthropic/OpenAI/ElevenLabs com validação síncrona (✓/✗) e Meta/Minimax
      como "salvo, não verificado".
- [ ] UI permite cadastrar mais de uma conexão Meta por conta, cada uma com `token_label` próprio.
- [ ] Skill de criação de campanha resolve o token pelo `meta_ad_account_id` do job, chama a Graph
      API via REST (não MCP), e **aborta** se a conexão não existir ou não estiver `active`.
- [ ] `lint` + `typecheck` + `test` + `format` verdes; `cd web && npm run build` verde com as rotas
      novas.
- [ ] Nenhuma rota nova acessível por `cliente_usuario` fora da própria conta (teste de authz).

## 8. Trade-offs

| Decisão | Escolha | Porquê |
|---|---|---|
| Meta Ads por tenant | Token de API por cliente via REST, substitui MCP na escrita | Pedido explícito do usuário; já previsto no ADR 0028, faltava implementar |
| Múltiplas contas de anúncio por cliente | Suportado, escolha sempre explícita por job | Schema já suporta; evita ambiguidade/erro silencioso |
| Probe no onboarding | Só Anthropic/OpenAI/ElevenLabs | Reusa Onda C; Meta/Minimax sem endpoint de auth barato testado |
| Dashboard de negócio | Rota nova `/admin/business` | Não mistura com dashboard operacional de tráfego (`/`) |
| "Minhas chaves" do operador | Rota nova `/admin/my-keys` | Separação de contexto: chave do operador vs chave de tenant |
