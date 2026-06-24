# ADR 0029 — Auth por account (sessão carrega account_id + role)

- **Status:** Accepted
- **Data:** 2026-06-24
- **Onda:** 13 (login multi-tenant)
- **Spec:** `docs/specs/SPEC-auth-por-account.md`

## Contexto

O dashboard nasceu single-operator: uma senha global (`DASHBOARD_PASSWORD`, SHA-256) gerava um JWT com
`role: 'operator'` (Onda 6). A Onda 12 trouxe `accounts` e o isolamento por `account_id` no schema e no
código (`scopeEq`/`withAccount`, ADR 0026), mas a **sessão não sabia quem é o tenant** —
`getCurrentScope()` devolvia sempre a account-âncora. Precisamos que cada tenant entre com suas
credenciais e a sessão carregue sua identidade, sem abandonar o princípio "toda leitura é server-side".

## Decisão

**Estendemos o JWT custom existente** (jose/HS256/`AUTH_SECRET`): a sessão passa a carregar
`{ sub: account_id, role, slug }`. O login é por **email** (`accounts.email citext unique`) + senha;
a senha é guardada como **scrypt** (`node:crypto`, formato `scrypt$<saltHex>$<hashHex>`) — KDF lento,
sem dependência nova nem binário nativo (roda igual na Vercel e no Fly). O isolamento continua
server-side: `scopeEq(scope)` filtra toda leitura; agora o scope vem da **sessão** (não da âncora).

Papéis: `super_admin` e **`socio`** veem todas as accounts (`scopeEq → null`); `cliente_usuario` só a
própria. `socio` é "super_admin reduzido" — mesma **visibilidade**, mas **sem ações privilegiadas de
plataforma** (desativar/excluir account, billing), barradas por `requireRole(['super_admin'])`.

**Bootstrap legado:** enquanto a âncora `acme` não tiver email+hash setados (reset único), o login do
`super_admin` aceita o `DASHBOARD_PASSWORD` atual (SHA-256, timing-safe) — o operador nunca é trancado
para fora durante a transição.

## Consequências

- **Positivas:** menor superfície nova (reusa o pipeline de sessão); leitura segue server-side; o
  operador atual vira `super_admin` sem reset; scrypt sem dependência externa; scope alimentado pela
  sessão real fecha a lacuna da Onda 12.
- **Negativas / trade-offs:** gestão de senha/identidade é nossa (reset/troca = trabalho futuro);
  `socio` ver tudo é deliberado (parceiro da agência), mas amplia o raio de quem vê dados de tenants —
  mitigado por ser papel concedido manualmente e sem ações destrutivas; 1 login por account (sem
  multiusuário) até existir `account_members`.
- **Riscos & mitigação:** sessão forjada → JWT assinado + claims validadas por schema; account inativa
  → `is_active` checado no login; enumeração de email → resposta de erro genérica + rate limit por IP;
  `scopeEq` é fronteira de segurança → mudança de `socio` coberta por teste.

## Alternativas consideradas

- **Supabase Auth (GoTrue)** — rejeitada: emite JWT ao browser (atrito com "nada de leitura no
  browser") e adiciona um 2º sistema de sessão. `accounts.auth_user_id` fica reservado caso migremos.
- **Manter SHA-256 para a senha de login** — rejeitada: fraco para senha de humano; scrypt é o mínimo.
- **Memberships (users×accounts) já agora** — adiada: MVP é 1 login por account; `account_members` fica
  para a fase de multiusuário.
