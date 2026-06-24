# Threat model STRIDE — Auth por account (Onda 13)

- **Onda:** 13
- **Superfície:** login por account (`POST /api/auth/login`), sessão JWT (`account_id`+`role`+`slug`),
  guardas `requireOperator`/`requireRole`/`apiClaims`, resolução de scope da sessão (`scopeFromClaims`),
  hash de senha scrypt, bootstrap legado (`DASHBOARD_PASSWORD`).
- **Confiança:** cada account é um tenant mutuamente desconfiado. A senha/`password_hash` é confidencial
  e nunca volta ao front. Entrada externa (email/senha) é **dado, não instrução**.
- **Specs/ADRs:** `SPEC-auth-por-account.md`, ADR 0029 (e 0026 para o isolamento).

## Ativos
- Credenciais de login (`accounts.password_hash` scrypt; nunca em texto puro, nunca no front).
- Integridade da sessão (JWT HS256 com `AUTH_SECRET`) e do `role` (decide visibilidade global vs. própria).
- Isolamento entre accounts (a sessão define o scope; `scopeEq` filtra toda leitura).

## STRIDE

### Spoofing
- **Ameaça:** entrar como outra account; forjar/alterar a sessão para elevar o `role`.
- **Mitigação:** senha verificada com scrypt timing-safe; JWT assinado com `AUTH_SECRET` e **claims
  validadas por schema** (`sessionClaimsSchema`: `sub` uuid + `role` enum + `slug`) — token forjado/
  adulterado vira sessão nula. `is_active` checado no login.

### Tampering
- **Ameaça:** adulterar o `role`/`account_id` no cookie; injeção via email.
- **Mitigação:** o `role` vem do **banco** no login (não do cliente) e é selado no JWT assinado; o cookie
  é `httpOnly`+`secure`+`SameSite=Lax`; email validado por schema (`z.string().email()`); leitura por
  PostgREST parametrizada (sem SQL string).

### Repudiation
- **Ameaça:** login sem rastro.
- **Mitigação:** `accounts.last_login_at` atualizado no sucesso; mutações seguem gerando `operation_logs`.

### Information Disclosure
- **Ameaça:** vazar `password_hash`/segredos; enumerar emails válidos; uma account ver dados de outra.
- **Mitigação:** `password_hash` lido só server-side (nunca em projeção de DISPLAY/resposta); erro de
  login **genérico** (`invalid_credentials`) não distingue "email não existe" de "senha errada";
  isolamento por `scopeEq` (só `cliente_usuario` é restrito; `super_admin`/`socio` veem tudo por design).

### Denial of Service
- **Ameaça:** brute-force de senha; flood no login.
- **Mitigação:** rate limit (Upstash) por IP no `/auth/login` antes do trabalho caro; Turnstile opcional;
  scrypt é caro de propósito (limita tentativas por segundo).

### Elevation of Privilege
- **Ameaça:** `cliente_usuario` agir como agência; `socio` executar ação privilegiada de plataforma.
- **Mitigação:** `scopeEq`/`canManageAccount` restringem `cliente_usuario` (fronteira de segurança com
  teste); ações privilegiadas (desativar/excluir account, billing) exigem `requireRole(['super_admin'])`
  — `socio` vê tudo mas **não** executa essas ações.

## Resíduo aceito
- **Bootstrap legado:** enquanto a âncora não tiver senha própria, o `DASHBOARD_PASSWORD` (SHA-256)
  concede sessão `super_admin`. É um segredo de config forte e some quando a âncora ganha senha scrypt
  (via `scripts/onda13/set-account-password.ts`). Aceito durante a transição.
- **`socio` com visibilidade global** — deliberado (parceiro da agência); sem modelo de atribuição
  sócio↔subconjunto ainda. Concedido manualmente, sem ações destrutivas.
- **1 login por account** (sem multiusuário) até existir `account_members`.
