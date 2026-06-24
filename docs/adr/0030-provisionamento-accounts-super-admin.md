# 0030 — Provisionamento de accounts pelo super_admin

- **Status:** Accepted
- **Data:** 2026-06-24
- **Onda:** 14
- **Contexto relacionado:** ADR 0026 (multi-tenancy app-layer), ADR 0029 (auth por account),
  SPEC `docs/specs/SPEC-provisionamento-accounts.md`.

## Contexto

As Ondas 12/13 entregaram schema multi-tenant e login por account, mas onboardar um tenant ainda exigia
SQL cru ou o script `set-account-password.ts`. A agência (super_admin) precisa criar e suspender contas
de cliente pelo próprio dashboard, com a mesma disciplina de segurança das outras superfícies.

## Decisão

Adicionar uma superfície de **provisionamento de accounts** restrita ao `super_admin`:

1. **Authz por papel na rota**, não por RLS. Mutações exigem `requireRole(['super_admin'])`; o
   isolamento de escrita vive na app (Opção A do ADR 0026), porque o `service_role` ignora RLS.
2. **A UI nunca cria `super_admin`.** Só `socio`/`cliente_usuario` (`PROVISIONABLE_ROLES`). Criar um
   super_admin continua sendo ato manual de banco — evita escalada de privilégio pela web.
3. **Soft-disable** via `is_active` (nunca hard-delete): preserva auditoria e FKs. Desativar corta o
   login na hora (`getLoginAccountByEmail` filtra `is_active=true`).
4. **Guarda pura `canToggleAccount`**: proíbe desativar a própria account (anti-lockout) e qualquer
   super_admin (protege a âncora). Testada como fronteira de segurança.
5. **Senha** inicial definida pelo super_admin, com hash **scrypt** (reuso da Onda 13); `password_hash`
   nunca é selecionado nas leituras nem devolvido nas respostas.
6. **Auditoria** em `operation_logs` (`entity_type='account'`) para create/activate/pause.

## Consequências

**Positivas:** go-to-market destravado (onboarding sem banco); superfície de escrita mínima e auditada;
nenhuma migration (risco zero de schema); reuso total do scrypt e do padrão de isolamento.

**Negativas / dívidas aceitas:** sem fluxo de convite por e-mail (super_admin digita a senha inicial);
sem multiusuário (1 login por account até `account_members`); sem self-service signup; troca de plano é
só rótulo (sem cobrança). O `socio` vê a lista completa de contas — deliberado (visibilidade global),
mas amplia o raio de quem enxerga nomes de tenants.

## Alternativas consideradas

- **RLS por account para escrita** — rejeitado: `service_role` bypassa RLS; o controle real é app-layer.
- **Hard-delete de account** — rejeitado: órfãos e perda de auditoria; soft-disable cobre o caso de uso.
- **Permitir criar super_admin pela UI** — rejeitado: escalada de privilégio; mantém-se manual.
- **Fluxo de convite/e-mail** — adiado: depende de provedor de e-mail e `account_members` (fase seguinte).
