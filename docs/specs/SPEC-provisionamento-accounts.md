# SPEC — Provisionamento de accounts pelo super_admin (Onda 14)

- **Status:** Approved-design
- **Ondas anteriores:** 12 (SaaS multi-tenant — schema + cofre), 13 (login por account).
- **ADR:** [0030](../adr/0030-provisionamento-accounts-super-admin.md). **Threat model:**
  [`provisionamento-accounts.md`](../security/threats/provisionamento-accounts.md).

## 1. Problema

Depois das Ondas 12/13 existe schema multi-tenant e login por account, mas **só dá para onboardar um
tenant via SQL cru / script** (`set-account-password.ts`). Isso trava o go-to-market: a agência
(super_admin) não consegue criar uma conta nova de cliente pelo dashboard, nem suspender uma conta
inadimplente sem mexer no banco.

## 2. Objetivo (vertical slice)

O **super_admin** provisiona accounts pelo dashboard:

1. **Criar** uma account (slug, nome, papel, plano, email, senha) — a senha nasce com hash **scrypt**
   (reuso da Onda 13), nunca em texto puro, nunca volta ao front.
2. **Listar** accounts com status (ativa/inativa, papel, plano, email, último login).
3. **Ativar/desativar** uma account (`is_active`). Desativar = o login para de funcionar
   imediatamente (o `getLoginAccountByEmail` já filtra `is_active=true`).

Fora de escopo (fase seguinte): multiusuário por account (`account_members`), billing real, troca de
plano com cobrança, "agir como" (impersonation/switcher), auto-cadastro público (signup).

## 3. Sem migration

A tabela `accounts` (Ondas 12+13) já tem **todas** as colunas necessárias: `slug`, `name`, `role`,
`plan`, `subscription_status`, `is_active`, `email`, `password_hash`, `last_login_at`. Esta onda é só
código (API + serviço + UI + domínio puro). Nenhuma mudança de schema.

## 4. Regras de negócio e segurança

- **`auth → authz → validação → lógica`** em toda rota. Mutar account exige `requireRole(['super_admin'])`;
  `socio` **vê** a lista (visibilidade global) mas **não** cria nem ativa/desativa (papel sem ações
  privilegiadas, ADR 0029). `cliente_usuario` não acessa a página nem o endpoint.
- **Anti-escalada de privilégio:** a UI **nunca** cria um `super_admin` — só `socio`/`cliente_usuario`
  (`PROVISIONABLE_ROLES`). Minteração de super_admin continua sendo ato manual de banco.
- **Anti-lockout / proteção da âncora:** não dá para desativar a **própria** account nem **qualquer**
  account `super_admin` (`canToggleAccount`). Fronteira de segurança pura e testada.
- **Senha:** valida ≥ 8 chars; hash scrypt server-side; `password_hash` **nunca** é selecionado nas
  leituras (projeção `ACCOUNT_DISPLAY_COLUMNS`) nem devolvido na resposta (parse pelo `accountRowSchema`,
  que não tem o campo).
- **Email** é identificador de login (não segredo) — `citext unique` no banco; colisão de slug/email
  vira **409 conflict** (mensagem genérica, sem dizer qual dos dois colidiu).
- **Auditoria:** toda criação/ativação/desativação grava `operation_logs` (`entity_type='account'`,
  `action` ∈ create|activate|pause, `actor`=slug de quem agiu).
- **Entrada externa é dado, não instrução:** tudo validado por Zod (`createAccountSchema`,
  `setAccountActiveSchema`); slug com charset restrito (`^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$`).

## 5. Trade-offs (decididos)

| Decisão | Escolha | Porquê / alternativa rejeitada |
|---|---|---|
| Onde mora o isolamento da escrita | **authz por papel na rota** (`super_admin`) | Coerente com ADR 0026 (Opção A, app-layer). RLS não age (service_role bypassa). |
| Papéis criáveis pela UI | **só `socio`/`cliente_usuario`** | Não mintar super_admin pela web (anti-escalada). Super_admin = ato de banco deliberado. |
| Desativar conta | toggle `is_active` (**soft**), nunca delete | Preserva histórico/auditoria e FKs (`clients`, `agent_jobs`, conexões). Hard-delete = risco de órfãos. |
| Senha no provisionamento | super_admin **define** a senha inicial | MVP sem fluxo de convite/e-mail. Cliente troca depois (fase com `account_members`). |
| `socio` na página | **read-only** | "vê tudo, sem ações privilegiadas" (ADR 0029) — consistente. |

## 6. Critérios de aceite

- `lint` + `typecheck` + `test` + `format` verdes; `cd web && npm run build` verde com a rota `/accounts`.
- Domínio puro testado: `buildAccountInsertRow`, `canToggleAccount`, `PROVISIONABLE_ROLES` (sem super_admin).
- `POST /api/data/accounts` cria com hash scrypt e responde **sem** `password_hash`; 403 para não-super_admin;
  409 em slug/email duplicado; 400 em payload inválido.
- `PATCH /api/data/accounts/:id` alterna `is_active`; 403 ao tentar desativar a si mesmo ou um super_admin;
  404 em id inexistente.
- `GET /api/data/accounts` restrito a visibilidade global (super_admin/socio).
- Página `/accounts` no nav só para super_admin/socio; formulário e toggles só para super_admin.
