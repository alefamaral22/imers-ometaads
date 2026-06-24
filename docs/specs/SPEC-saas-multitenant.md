# SPEC — SaaS multi-tenant (accounts, conexões Meta, segredos por cliente)

- **Onda:** extra (entre Onda 11 e a personalização) — chamada aqui de **Onda 12 — Multi-tenancy**
- **Status:** Approved-design (decisões de §5 validadas pelo operador 2026-06-24; pronta para migration)
- **Depende de:** Onda 1 (schema base §6), Onda 2/3 (skills + runner), Onda 6 (dashboard + auth)
- **Decisões estruturais (ADRs a escrever junto da migration):**
  - ADR 0026 — Multi-tenancy por `account_id` + isolamento de tenant
  - ADR 0027 — Segredos por tenant criptografados em repouso (tokens Meta + API keys)
  - ADR 0028 — Acesso à Meta por **token manual do tenant** (System User) vs. MCP-connector compartilhado

---

## 1. Objetivo

Transformar a agência (hoje single-operator, auth por senha única `DASHBOARD_PASSWORD`) em um
**SaaS multi-tenant**: múltiplas empresas/usuários pagantes ("accounts"), cada um com seus próprios
clientes, suas próprias contas de anúncio Meta conectadas, e suas próprias chaves de API — com
**isolamento estrito entre tenants** e **segredos criptografados em repouso, nunca devolvidos ao
frontend**.

O escopo desta onda é **só a fundação de dados + contratos** (migration, RLS, criptografia,
contrato de resolução de chaves/tokens). UI de billing, OAuth da Meta e onboarding self-service
ficam para fases seguintes; aqui deixamos os **ganchos** (enums, colunas) prontos para não exigir
migration depois.

### Não-objetivos (explícitos)

- **OAuth oficial da Meta** ("Continuar com Facebook para Empresas") — fica no enum
  `connection_method` desde já, mas **sem nenhuma implementação por trás** (ver §4.3 / decisão consciente).
- Billing real (Stripe/cobrança) — só os campos de `plan`/`subscription_status` no schema; integração depois.
- Multi-usuário por account (memberships, convites) — MVP trata 1 account ≈ 1 identidade de login;
  `role` mora na própria account. Memberships são fase 2.
- Migração do modelo de auth para Supabase Auth/JWT no browser — **mantemos** o princípio do projeto
  ("toda leitura é server-side; só `service_role` acessa o banco"). Ver §5.

---

## 2. Estado atual relevante (do que partimos)

- `clients.slug` é **único global** e `clients.ad_account_id` é **único global**. Skills resolvem o
  cliente por slug global (`lista-de-clientes`, `create-traffic-cliente-exemplo-campaign`, etc.).
- Auth do dashboard = senha única (Onda 6). Não há tabela de usuários nem noção de tenant.
- **Meta hoje é acessada por um único connector compartilhado** (Anthropic Meta MCP via `claude login`
  no runner), **não** por token em env. Uma única identidade Meta para "a agência inteira".
- Banco real `yjmngxsdfsxtzjastvwi` **já tem o schema da Onda 1 aplicado e dados vivos** (seed
  `cliente-exemplo`, campanhas reais criadas pelo runner). ⇒ esta migration é **aditiva + backfill
  seguro**, nunca recriação.
- Convenções invioláveis (CLAUDE.md / `.claude/rules/`): dinheiro em centavos int; IDs Meta em `text`;
  enums Postgres para domínios fechados; RLS deny-by-default; segredos fora do código; toda leitura
  server-side; threat model STRIDE por superfície nova.

---

## 3. Modelo de dados — extensão da §6

> DDL abaixo é **contrato** (o exato vai na migration após aprovação). Money em centavos int; IDs Meta
> em `text`; `raw_spec`/payloads crus em `jsonb`; trigger `set_updated_at` nas mutáveis; append-only
> sem UPDATE; toda tabela nova entra em `…_rls.sql` (deny-by-default).

### 3.1. Novos enums

```sql
create type public.account_role        as enum ('super_admin', 'socio', 'cliente_usuario');
create type public.account_plan        as enum ('trial', 'starter', 'pro', 'agency');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'paused');
create type public.connection_method   as enum ('manual_token', 'oauth_meta');   -- oauth_meta: placeholder, sem implementação no MVP
create type public.connection_status   as enum ('unverified', 'active', 'invalid', 'revoked');
create type public.api_key_provider    as enum ('anthropic', 'openai', 'elevenlabs', 'minimax', 'other');
create type public.api_key_status      as enum ('unverified', 'active', 'invalid');
```

> **Trade-off (plan como enum):** o projeto usa enum para domínios fechados, mas nomes de plano
> comercial mudam mais que o resto. Mantemos enum por consistência e legibilidade; evoluir exige
> `ALTER TYPE ... ADD VALUE`. Alternativa rejeitada para o MVP: tabela `plans` lookup (mais flexível,
> mais cara agora).

### 3.2. `accounts` — empresa/usuário pagante (o tenant)

```sql
create table public.accounts (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  name                text not null,
  role                public.account_role not null default 'cliente_usuario',
  plan                public.account_plan not null default 'trial',
  subscription_status public.subscription_status not null default 'trialing',
  -- billing (integração fase 2; só campos)
  billing_customer_id text,                 -- id no provedor de cobrança (ex.: Stripe), quando houver
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  -- auth (fase 2: Supabase Auth real). No MVP pode ficar null; mapeia a identidade de login.
  auth_user_id        uuid unique,
  is_active           boolean not null default true,   -- suspender sem deletar
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
```

- `role`: `super_admin` (a agência/dono — enxerga todas as accounts), `socio` (sócio — subconjunto
  de accounts; semântica plena = fase 2, no MVP equivale a super_admin com escopo a definir),
  `cliente_usuario` (tenant pagante — só a própria account).
- **Backfill:** a migration cria uma account-âncora `slug='acme'`, `role='super_admin'` e amarra
  os `clients` existentes a ela (ver §3.7).

### 3.3. `clients` ganha `account_id` (e slug passa a ser por-account)

```sql
alter table public.clients
  add column account_id uuid references public.accounts (id) on delete cascade;  -- nullable no passo 1; NOT NULL após backfill

-- slug deixa de ser único global e passa a ser único POR account:
alter table public.clients drop constraint clients_slug_key;
alter table public.clients add constraint clients_account_slug_uniq unique (account_id, slug);

create index clients_account_id_idx on public.clients (account_id);
-- ad_account_id CONTINUA único global (anti-hijack: uma conta de anúncio Meta = um único tenant).
```

> **Impacto nas skills:** a resolução `slug → client` deixa de ser global. As skills/serviços passam a
> resolver `(account_id, slug)`. No MVP, como só há a account-âncora, nada quebra; mas o contrato muda
> e precisa ser respeitado a partir daqui (ver §6).

### 3.4. `ad_account_connections` — 1 linha por conta de anúncio conectada

```sql
create table public.ad_account_connections (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null references public.accounts (id) on delete cascade,
  client_id             uuid references public.clients (id) on delete set null,  -- qual cliente/marca essa conexão alimenta
  meta_ad_account_id    text not null,                 -- o act_<id>
  business_manager_id   text,
  connection_method     public.connection_method not null default 'manual_token',
  -- ↓ token MANUAL (System User), SEMPRE criptografado em repouso; nunca texto puro; nunca volta ao front
  access_token_cipher   bytea,                          -- AES-256-GCM (iv||tag||ciphertext); null se método != manual_token
  access_token_last4    text,                           -- só os últimos 4 chars, p/ exibir "••••abcd"
  token_label           text,                           -- rótulo legível: "System User — João"
  key_version           smallint not null default 1,    -- versão da chave de criptografia (rotação)
  -- ↓ placeholder oauth_meta (fase 2, SEM uso no MVP)
  oauth_meta_user_id    text,
  -- ↓ saúde do token
  status                public.connection_status not null default 'unverified',
  last_validated_at     timestamptz,                    -- última vez que confirmamos que o token funciona
  last_validation_error text,
  connected_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 1 conexão ATIVA por conta de anúncio no mundo (anti-hijack); revogada pode ser reconectada.
create unique index ad_account_connections_meta_active_uidx
  on public.ad_account_connections (meta_ad_account_id)
  where status in ('unverified', 'active');

create index ad_account_connections_account_id_idx on public.ad_account_connections (account_id);
```

**Contratos de segurança do token (invioláveis):**

1. `access_token_cipher` guarda **só ciphertext** — nunca o token em texto puro. Criptografia
   **app-level AES-256-GCM** (Node), chave em env (`AD_TOKEN_ENC_KEY`, 32 bytes), **nunca no banco**.
   Trade-off vs. pgcrypto em §7.2.
2. O token **nunca** retorna ao frontend depois de salvo. A UI mostra apenas `access_token_last4`
   ("••••abcd") e `connected_at`/`last_validated_at` ("conectado em DD/MM"). O serviço de leitura
   **exclui** `access_token_cipher` da projeção exposta — a coluna nunca sai do servidor.
3. Decifrar só acontece no servidor (runner) no instante de chamar a Meta. Ver §5.3.

### 3.5. `api_keys_clientes` — chaves de provedor por account

```sql
create table public.api_keys_clientes (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts (id) on delete cascade,
  provider          public.api_key_provider not null,
  label             text,
  key_cipher        bytea not null,        -- AES-256-GCM; nunca texto puro
  key_last4         text,                  -- só p/ exibir
  key_version       smallint not null default 1,
  status            public.api_key_status not null default 'unverified',
  last_validated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (account_id, provider)            -- 1 chave ativa por provedor por account (MVP)
);

create index api_keys_clientes_account_id_idx on public.api_keys_clientes (account_id);
```

- Mesmos contratos do token: ciphertext em repouso, **nunca** devolvida ao front (só `key_last4`),
  decifrada só server-side no momento de uso.
- Regra de uso (inviolável): **quando o cliente tem chave própria configurada (status ≠ invalid), o
  sistema usa a chave dele; nunca a global do `.env`.** Fora do `super_admin`, a chave própria é
  **obrigatória** — sem chave, o job aborta (decisão validada §5.2). Ver §5.2.

### 3.6. `agent_jobs` ganha `account_id` (conveniência do runner + escopo)

```sql
alter table public.agent_jobs
  add column account_id uuid references public.accounts (id) on delete cascade;  -- preenchido no enqueue
create index agent_jobs_account_id_idx on public.agent_jobs (account_id);
```

Denormalizado a partir do `client_id` no enqueue. Porquê: o runner resolve as chaves/token do tenant
**sem join extra** e o escopo de isolamento fica explícito na fila. As demais tabelas de domínio
(`campaigns`, `analyses`, `landing_pages`, …) continuam escopadas via `client_id → account_id` (join);
denormalizar `account_id` nelas é opção aberta (§7.3), não feita no MVP.

### 3.7. Backfill (na mesma migration, ordem importa)

```sql
-- 1) coluna nullable já adicionada (§3.3 / §3.6)
-- 2) cria a account-âncora da agência
insert into public.accounts (slug, name, role, plan, subscription_status)
values ('acme', 'Acme (agência)', 'super_admin', 'agency', 'active')
on conflict (slug) do nothing;
-- 3) amarra todos os clients órfãos à âncora
update public.clients set account_id = (select id from public.accounts where slug = 'acme')
 where account_id is null;
update public.agent_jobs j set account_id = c.account_id
  from public.clients c where j.client_id = c.id and j.account_id is null;
-- 4) trava NOT NULL onde faz sentido
alter table public.clients alter column account_id set not null;
-- agent_jobs.account_id fica NULLABLE (jobs podem não ter client_id; ex.: summarize global)
```

### 3.8. RLS e triggers das novas tabelas

- `accounts`, `ad_account_connections`, `api_keys_clientes` entram em `…_rls.sql` com
  `enable row level security` (deny-by-default, sem policies — ver §5 para a discussão de isolamento).
- `set_updated_at` nas três (todas têm `updated_at`).

---

## 4. Conexão Meta: manual_token agora, oauth_meta depois

### 4.1. O que muda no acesso à Meta

Hoje a Meta é falada por **um connector compartilhado** (Anthropic Meta MCP, uma identidade para toda
a agência). Multi-tenant exige que **cada tenant traga a própria credencial Meta**. No MVP isso é um
**System User token manual** por conexão. ⇒ O runner passa a chamar a Meta **com o token do tenant**
(REST Graph API) para as operações daquele tenant, em vez de depender só do MCP-connector. Essa é a
mudança arquitetural mais relevante da onda (ADR 0028; trade-offs em §7.1).

### 4.2. `manual_token` (MVP — único implementado)

- O gestor cola um **System User access token** (gerado no Business Manager do cliente, com
  `ads_management`/`ads_read`). O sistema cifra (AES-256-GCM), guarda `last4` + `label`, valida na
  hora (chamada barata à Graph) e marca `status='active'` + `last_validated_at`.
- System User token **não expira sozinho**, mas pode ser **revogado** do lado do cliente ⇒ precisamos
  de validação periódica (§5.4).

### 4.3. `oauth_meta` (no enum, SEM implementação no MVP) — decisão consciente

`oauth_meta` existe no enum `connection_method` **desde já**, para não exigir migration quando a fase 2
chegar — **mas não há nenhuma funcionalidade por trás dele no MVP**. Nenhum fluxo OAuth, nenhum
callback, nenhum botão "Continuar com Facebook para Empresas" ligado.

**Motivo (decisão consciente, não limitação esquecida):** usar o login oficial da Meta em escala exige
**Business Verification** + **App Review aprovado** para `ads_management` / `ads_read` /
`business_management`. Isso é trabalho de **fase 2**, que só faz sentido **depois de termos clientes
pagantes reais** (o App Review da Meta pede app em produção, casos de uso reais, vídeo de fluxo, etc.).
Cravar o valor no enum agora é barato e evita dívida de schema; implementar o fluxo agora seria caro e
prematuro. Por isso: enum sim, código não.

---

## 5. Trade-offs centrais (o que o operador precisa validar)

### 5.1. Isolamento de tenant (account A nunca vê dados de account B)

O projeto tem um princípio forte e inviolável: **RLS deny-by-default, só `service_role` acessa, toda
leitura é server-side** (o `service_role` tem `BYPASSRLS`). Isso cria uma tensão: políticas de RLS
"por account" **não fazem efeito no caminho atual de leitura**, porque o `service_role` ignora RLS.
Duas formas de garantir o isolamento:

- **Opção A — Escopo na aplicação (recomendada p/ MVP).** Mantém o caminho `service_role` + leitura
  server-side. **Toda** query passa por um único acessador escopado, `withAccount(accountId)`, que
  injeta `account_id` (ou `account_id` via `client_id`) em **toda** leitura/escrita. O isolamento é
  garantido por esse **único ponto de estrangulamento** + testes que falham se uma query de tenant
  esquecer o filtro. `super_admin` desativa o filtro (vê tudo). Casa com a arquitetura atual; custo
  baixo. Risco: um `.eq('account_id', …)` esquecido = vazamento → mitigado por choke-point único + teste.
- **Opção B — RLS real com GUC + role não-bypass (defesa em profundidade).** Cria um role Postgres
  **sem** `BYPASSRLS` (`app_tenant`), o servidor faz `SET LOCAL app.current_account = '<uuid>'` por
  request, e as policies usam `using (account_id = current_setting('app.current_account')::uuid)`.
  Aí até um bug de app (filtro esquecido) é barrado pelo banco. Mais robusto, mas adiciona role novo,
  plumbing de conexão e revisão de todas as policies.

**Decisão (validada 2026-06-24):** **Opção A no MVP**, com o schema já carregando `account_id` em toda
tabela de tenant (direto ou por `client_id`), de forma que a **Opção B vire um add sem migration**
depois (só policies + role). ADR 0026 registra que, no MVP, a *enforcement* operante é o escopo
server-side (porque a leitura é server-side e o `service_role` ignora RLS); as policies por account
entram como camada extra quando/se introduzirmos leitura por role não-bypass.

### 5.2. Como o runner decide qual chave de API usar por job

Contrato `resolveProviderKey(account_id, provider)`:

1. Busca em `api_keys_clientes` por `(account_id, provider)` com `status ∈ {active, unverified}`.
2. **Se existe → usa a chave do tenant (decifrada server-side). NUNCA cai para a global do `.env`.**
3. Se **não** existe:
   - `super_admin` (a agência) → usa a chave global do `.env` (comportamento atual).
   - **qualquer outro role → o job aborta** com erro claro ("configure sua chave de <provider>").
     **Decisão validada §5.2:** fora do `super_admin`, chave própria é obrigatória — sem fallback à
     global. Isolamento total de custo; atrito de onboarding aceito.

Detalhe crítico para **Anthropic**: o runner roda as skills via `claude -p` (subprocesso). Para o
tenant pagar o próprio uso de LLM, o `run-skill.sh` precisa **lançar o subprocesso com
`ANTHROPIC_API_KEY` (e `OPENAI_API_KEY`) do tenant no env**, resolvidos por job — em vez do OAuth/chave
global. Implementável (o runner já monta o env do subprocesso), mas é uma mudança no `run-skill.sh` +
`poll-agent-jobs.sh` (resolver as chaves no claim, injetar no env, **nunca logar**). Atribuição de
custo segue a chave usada: chave do tenant = fatura do tenant.

### 5.3. Criptografia dos segredos em repouso

- **App-level AES-256-GCM (validada).** Cifra/decifra no Node (runner + dashboard server-side), com
  **chaves separadas por tipo de segredo (decisão validada §5.3):** `AD_TOKEN_ENC_KEY` (32 bytes) p/
  os tokens Meta em `ad_account_connections` e `API_KEY_ENC_KEY` (32 bytes) p/ as keys de provedor em
  `api_keys_clientes`. Blast radius menor + rotação independente (via `key_version`). DB guarda só
  `iv||authTag||ciphertext`. **A chave nunca transita para o Postgres** ⇒ dump/backup/admin do banco
  nunca veem texto puro.
- Alternativa **pgcrypto (`pgp_sym_encrypt`)** — rejeitada para o MVP: exige a chave transitar até o
  Postgres (aparece em parâmetros de query/logs), e o objetivo é justamente manter a chave fora do banco.

### 5.4. Detecção de token/chave que parou de funcionar

- Campos: `status` (`unverified→active→invalid/revoked`), `last_validated_at`, `last_validation_error`.
- **Validação na escrita:** ao salvar uma conexão/chave, o servidor faz uma chamada barata
  (Meta: `GET /act_<id>?fields=name,account_status`; Anthropic/OpenAI: um ping mínimo) e grava o status.
- **Validação periódica (runner):** novo cron/skill `validate-connections-tick` (read-only) percorre
  conexões/chaves `active`, refaz o ping com o segredo decifrado; em erro de auth → marca
  `invalid`/`revoked` + `last_validation_error`, e **avisa o gestor** (banner no dashboard +
  Telegram/email opcional, fail-safe log-only — mesmo padrão das análises). System User token não expira
  sozinho, mas isso pega revogação do lado do cliente.
- A skill de tráfego/análise, ao claimar um job de um tenant com conexão `invalid`, **aborta cedo** com
  erro claro (em vez de falhar fundo na Meta).
- **Cadência (validada §5.4): 1×/dia** por conexão/chave ativa (barato, suficiente p/ pegar revogação),
  **mais revalidação imediata sob demanda** quando um job falha por auth.

---

## 6. Impacto no resto do sistema (o que esta onda obriga depois)

- **Skills/serviços:** resolução de cliente passa a ser `(account_id, slug)`; persistência e leitura
  passam pelo escopo de account; runner injeta chaves/token do tenant no subprocesso.
- **Dashboard:** acessador `withAccount` (Opção A); sessão carrega `account_id` + `role`; telas de
  "Conexões Meta" e "Chaves de API" (mostram só `last4`/datas; nunca o segredo). Auth evolui de senha
  única para login por account (modelagem de auth real = item à parte; aqui só o schema/contrato).
- **Nexus:** as tools de leitura/escrita passam a operar dentro do escopo da account da sessão.
- **Threat model STRIDE novo** (`docs/security/threats/saas-multitenant.md`): superfícies de
  cross-tenant access, vazamento de segredo, token revogado, injeção via args de job por tenant.

---

## 7. Alternativas consideradas (resumo)

1. **§7.1 Meta por token manual vs. manter só o MCP-connector compartilhado** — manter o connector não
   escala multi-tenant (uma identidade para todos = sem isolamento de conta Meta, sem atribuição de
   custo/permissão por cliente). Token manual por tenant é o mínimo viável; OAuth oficial é o destino
   (fase 2, gated por App Review). Detalhe no ADR 0028.
2. **§7.2 App-level AES-GCM vs. pgcrypto** — ver §5.3 (chave fora do banco vence).
3. **§7.3 Denormalizar `account_id` em todas as tabelas vs. só nas "donas" + join** — MVP coloca
   `account_id` em `accounts`(dona), `clients`, `ad_account_connections`, `api_keys_clientes`,
   `agent_jobs`(conveniência); demais escopam por `client_id`. Denormalizar tudo facilita queries do
   dashboard mas adiciona redundância/risco de inconsistência; fica como opção aberta.
4. **§7.4 Role na account vs. memberships (users×accounts)** — MVP põe `role` na account (1 account ≈ 1
   login). Memberships (multi-usuário, convites, papéis por usuário) = fase 2; o schema não impede.

---

## 8. Critérios de aceite (da migration — Onda 12)

- [ ] Migration **aditiva** aplica limpo sobre o banco vivo (`yjmngxsdfsxtzjastvwi`) **e** num
      `supabase db reset` do zero, sem erro.
- [ ] Backfill: account-âncora `acme` (super_admin) criada; **todo** `clients` existente com
      `account_id` preenchido; `clients.account_id` vira `NOT NULL` sem violação.
- [ ] `clients` passa a ter unicidade `(account_id, slug)`; `ad_account_id` segue único global.
- [ ] 3 tabelas novas (`accounts`, `ad_account_connections`, `api_keys_clientes`) com RLS habilitado
      deny-by-default e trigger `set_updated_at`.
- [ ] Enums novos criados; `oauth_meta` presente no enum **sem** caminho de código.
- [ ] Nenhuma coluna de segredo em texto puro; projeções de leitura **excluem** `*_cipher`.
- [ ] `select` nas novas tabelas funciona como `service_role` e retorna vazio como `anon`.
- [ ] `lint` + `typecheck` + `test` verdes; ADRs 0026/0027/0028 escritos; threat model STRIDE da
      superfície nova.

---

## 9. Plano de entrega (após aprovação)

1. **Migration + ADRs + threat model** (esta é a "Onda extra, antes do dashboard" que o operador pediu).
2. Helpers de criptografia (`encrypt/decrypt` AES-256-GCM) + contrato `resolveProviderKey` (lógica pura
   testável, sem I/O) — testes primeiro.
3. Ajuste do runner (`run-skill.sh`/poll) para injetar chaves do tenant + skill `validate-connections-tick`.
4. Serviços/telas do dashboard (conexões/chaves) + acessador `withAccount`.
5. Evolução do modelo de auth para login por account (item próprio).

> **Esta spec não implementa nada.** Próximo passo: validação do operador dos pontos de §5 antes de
> escrever a migration.
