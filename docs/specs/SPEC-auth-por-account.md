# SPEC — Auth por account (login multi-tenant)

- **Onda:** 13 (continuação do SaaS multi-tenant; depende da Onda 12)
- **Status:** Approved-design (trade-offs de §5 validados pelo operador 2026-06-24; pronta para execução)
- **Depende de:** Onda 6 (auth single-operator), Onda 12 (`accounts`, scope, `withAccount`)
- **Decisão estrutural:** ADR 0029 — Auth por account (sessão carrega `account_id`+`role`)

---

## 1. Objetivo

Evoluir o login do dashboard de **operador único** (uma senha global `DASHBOARD_PASSWORD` → JWT com
`role: 'operator'`) para **login por account**: cada tenant entra com suas credenciais e enxerga só os
próprios dados; a agência (`super_admin`) entra no console e vê/gere todas as accounts. É o item que a
Onda 12 deixou explicitamente para uma fase própria (SPEC-saas-multitenant §1, §6).

Hoje o isolamento já existe no schema (`account_id` em tudo) e no código (`scopeEq`/`withAccount`,
ADR 0026), mas **a sessão não carrega quem é o tenant** — `getCurrentScope()` devolve sempre a
account-âncora `acme` (super_admin). Esta onda preenche essa lacuna: a sessão passa a carregar
`account_id` + `role`, e o scope vem da sessão, não de um valor fixo.

### Não-objetivos (explícitos)

- **Memberships (multi-usuário por account)** — MVP mantém **1 login por account** (credencial na
  própria `accounts`). Convites, papéis por usuário e `account_members` ficam para depois.
- **Self-service signup / billing** — criação de account segue manual (super_admin). Onboarding
  self-service é fase posterior.
- **Troca do modelo "leitura server-side"** — mantemos o princípio inviolável: nada de leitura direta
  do browser; o JWT da sessão só identifica o tenant, e toda query continua server-side via
  `service_role` + `scopeEq` (ADR 0002/0026).

---

## 2. Estado atual (do que partimos)

- `web/lib/auth/domain.ts`: `OPERATOR_ROLE='operator'`, `sessionClaimsSchema={sub,role}` (ambos
  literal `operator`), `loginInputSchema={password,turnstileToken?}`, `passwordMatches` (timing-safe
  SHA-256), `buildOperatorClaims`, `isAuthorizedOperator`.
- `web/lib/auth/session.ts`: assina/verifica JWT HS256 com `AUTH_SECRET` (claims `{sub,role}`).
- `route.ts` `/auth/login`: rate limit → valida → Turnstile opcional → compara digest com
  `DASHBOARD_PASSWORD` → seta cookie. `requireOperatorApi`/`requireOperator` barram rotas.
- `accounts` (Onda 12): `id, slug, name, role, plan, subscription_status, auth_user_id, is_active, …`.
  **Ainda não tem credencial** (email/senha).
- `getCurrentScope()` (services/accounts.ts): devolve `super_admin` + id da âncora — **a substituir**
  por leitura da sessão.

---

## 3. Modelo de dados — extensão de `accounts`

```sql
-- Identidade + credencial por account (1 login por account no MVP).
alter table public.accounts add column email         citext unique;  -- requer extensão citext
alter table public.accounts add column password_hash text;           -- SHA-256 hex (ou bcrypt — ver §5.3)
alter table public.accounts add column last_login_at timestamptz;
```

- `email` único (case-insensitive) é o identificador de login. `slug` continua para URLs/recursos.
- `password_hash` nunca em texto puro; nunca volta ao front. `auth_user_id` (já existe) fica reservado
  para uma futura migração a Supabase Auth, sem uso no MVP.
- **Backfill:** a account-âncora `acme` recebe `email` (ex.: o do operador) e `password_hash` = o
  digest atual de `DASHBOARD_PASSWORD`, para o operador continuar entrando sem reset.

---

## 4. Fluxo de auth (alvo)

1. **Login** (`POST /auth/login`): body `{ email, password, turnstileToken? }`. Resolve a account por
   `email` (server-side); se `is_active` e a senha confere (timing-safe), assina um JWT com
   `{ sub: <account_id>, role: <account.role>, slug }`. Rate limit + Turnstile como hoje.
2. **Sessão**: cookie `httpOnly+secure+SameSite=Lax`, claims `{ sub: accountId, role, slug }`. TTL 8h.
3. **Authz**: `requireSession()` devolve as claims; `requireRole(['super_admin'])` para rotas de
   agência. `getCurrentScope()` passa a montar o `AccountScope` **a partir das claims**.
4. **Isolamento**: inalterado no mecanismo — `scopeEq(scope)` filtra toda leitura; `super_admin` vê
   tudo; `cliente_usuario` só a própria. Já implementado na Onda 12; agora alimentado pela sessão real.
5. **super_admin (console da agência)**: vê todas as accounts; um **seletor de account** define a
   account "corrente" para criar recursos (conexões/chaves) — opcionalmente persistido como
   `actingAccountId` na sessão. Não é impersonation de credencial; é escopo de trabalho.
6. **Logout**: inalterado.

---

## 5. Trade-offs centrais (validados 2026-06-24)

### 5.1. Mecanismo de auth — **JWT custom estendido** ✅

A sessão só ganha `account_id`+`role`; reusa `jose`/HS256/`AUTH_SECRET` e o pipeline existente. Mantém
"leitura server-side"; menor superfície nova; o operador atual vira `super_admin` sem quebrar. Gestão
de senha/identidade é nossa. *(Supabase Auth/GoTrue rejeitado: emite JWT ao browser, atrito com o
princípio "nada de leitura no browser", e adiciona um 2º sistema de sessão.)*

### 5.2. Identificador de login — **email** ✅

`accounts.email citext unique` é o login. `slug` segue só para URLs/recursos.

### 5.3. Hash de senha — **bcrypt/scrypt** ✅

KDF lento (senha de humano pede resistência a brute-force offline). Difere do `DASHBOARD_PASSWORD`
(SHA-256, que era segredo de config, não senha de usuário). Backfill da âncora: setar via reset único.
Adiciona uma dependência (ex.: `bcryptjs`, JS puro — evita binário nativo no build da Vercel/Fly).

### 5.4. Papel `socio` — **super_admin reduzido** ✅

`socio` enxerga **todas** as accounts (mesmo `scopeEq → null` do `super_admin`) — é um parceiro da
agência, não um tenant isolado. "Reduzido" = mesma **visibilidade** de dados, porém **sem ações
privilegiadas de plataforma** (reservadas ao `super_admin`): ex. desativar/excluir accounts, gerir
billing, criar outras accounts. No MVP isso vira uma checagem de papel nas rotas dessas ações
(`requireRole(['super_admin'])`); a leitura/operação de campanhas/conexões/chaves é igual à do
super_admin. O modelo de atribuição sócio↔subconjunto-de-accounts fica para depois (não é preciso aqui).

> **Consequência no scope:** `scopeEq` passa a liberar tudo para `role ∈ {super_admin, socio}` e
> restringir só `cliente_usuario`. `canManageAccount` idem. Atualizar `web/lib/multitenant/scope.ts`
> (hoje só `super_admin` é irrestrito) + testes — **mudança pequena, mas é fronteira de segurança**.

---

## 6. Impacto / entregáveis (após aprovação)

- **Migration** (`accounts.email/password_hash/last_login_at` + `citext`) + backfill da âncora + ADR 0029.
- **Domain auth** (`web/lib/auth/domain.ts`): `sessionClaimsSchema` passa a `{ sub: uuid, role: accountRole, slug }`; `loginInputSchema` ganha `email`; `buildClaims(account)`; `isAuthorizedOperator` → `hasRole`. Tudo puro + testes.
- **Infra**: `session.ts` assina/verifica as novas claims; `server.ts`/`requireOperatorApi` viram `requireSession`/`requireRole`; `/auth/login` resolve por email + verifica hash.
- **Scope**: `getCurrentScope()` lê a sessão (não a âncora). Serviços de leitura já aceitam `AccountScope`.
- **UI**: login por email+senha; nav mostra a account corrente; super_admin ganha seletor de account.
- **Segurança**: rate limit por email+IP; lockout opcional; **threat model STRIDE** atualizado
  (cross-tenant via sessão forjada, account inativa, enumeração de email).
- **Testes**: unit do domínio (claims/roles/login), integração do login, e2e do fluxo por account.

---

## 7. Critérios de aceite (da Onda 13)

- [ ] Migration aditiva aplica limpo (banco vivo + `db reset`); âncora `acme` com email+hash; operador
      atual continua entrando.
- [ ] Login por email+senha emite JWT com `account_id`+`role`; sessão forjada/adulterada é rejeitada.
- [ ] `cliente_usuario` só lê/gere a própria account; `super_admin` vê todas (seletor de account).
- [ ] `getCurrentScope()` vem da sessão; nenhuma leitura de tenant escapa do `scopeEq`.
- [ ] `lint`+`typecheck`+`test`+`web build` verdes; ADR 0029 + threat model escritos.

---

## 8. Plano de entrega (sugerido, uma fatia por commit)

1. Migration + ADR 0029 + backfill da âncora.
2. Domain auth (claims/roles/login) + testes — **começa pelos testes**.
3. Infra (session/login por email+hash) + `getCurrentScope` da sessão.
4. UI (login por email, seletor de account do super_admin) + threat model.

> **Esta spec não implementa nada.** Próximo passo: validação dos trade-offs de §5.
