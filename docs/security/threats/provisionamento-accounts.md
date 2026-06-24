# Threat model STRIDE — Provisionamento de accounts (Onda 14)

- **Onda:** 14
- **Superfície:** `POST /api/data/accounts` (criar), `PATCH /api/data/accounts/:id` (ativar/desativar),
  `GET /api/data/accounts` (listar), página `/accounts`, domínio puro `accounts-admin`
  (`buildAccountInsertRow`, `canToggleAccount`, `PROVISIONABLE_ROLES`).
- **Confiança:** só o `super_admin` muta; `socio` lê; `cliente_usuario` não acessa. Senha em texto puro
  só transita para ser cifrada (scrypt) e nunca persiste/volta. Entrada externa é **dado, não instrução**.
- **Specs/ADRs:** `SPEC-provisionamento-accounts.md`, ADR 0030 (e 0026/0029 para isolamento e auth).

## Ativos
- Integridade do conjunto de accounts (quem existe, com que papel/plano e ativa ou não).
- `password_hash` (scrypt) — confidencial; nunca selecionado nem devolvido.
- A fronteira de papel (`super_admin` muta; `socio` só lê) e a proteção da âncora super_admin.

## STRIDE

### Spoofing
- **Ameaça:** um não-super_admin (ou sessão forjada) criar/suspender contas.
- **Mitigação:** `auth → authz` antes de tudo; mutação exige `hasRole(claims,['super_admin'])` na API e
  `requireRole(['super_admin'])` na página; claims vêm de JWT assinado e validado por schema (ADR 0029).

### Tampering
- **Ameaça:** forjar payload para criar um `super_admin`, mexer em `password_hash`, ou alvejar `:id` arbitrário.
- **Mitigação:** `createAccountSchema` aceita `role` só em `{socio, cliente_usuario}` (anti-escalada);
  o row de insert é montado por `buildAccountInsertRow` (server-side; cliente não escolhe colunas);
  `:id` validado como uuid; leitura/escrita por PostgREST parametrizado (sem SQL string).

### Repudiation
- **Ameaça:** criar/suspender conta sem rastro.
- **Mitigação:** `operation_logs` por mutação (`entity_type='account'`, `action` create|activate|pause,
  `actor`=slug do super_admin).

### Information Disclosure
- **Ameaça:** vazar `password_hash`; um cliente listar todas as contas; distinguir slug vs email no erro.
- **Mitigação:** leitura projeta `ACCOUNT_DISPLAY_COLUMNS` (sem `password_hash`) e o parse pelo
  `accountRowSchema` o descarta de qualquer representação; `GET /data/accounts` restrito a visibilidade
  global (super_admin/socio); colisão responde **409 genérico** (não diz se foi slug ou email).

### Denial of Service
- **Ameaça:** flood de criação; scrypt (caro) como vetor de exaustão de CPU.
- **Mitigação:** endpoint atrás de sessão `super_admin` (não público) — superfície minúscula e confiável;
  scrypt roda 1x por criação, sob ator autenticado e auditado. (Sem rate-limit dedicado: não é público.)

### Elevation of Privilege
- **Ameaça:** criar super_admin pela web; desativar a si mesmo ou a âncora para travar a plataforma.
- **Mitigação:** `PROVISIONABLE_ROLES` exclui `super_admin`; `canToggleAccount` proíbe desativar a própria
  account e qualquer super_admin — guarda pura, coberta por teste.

## Resíduo aceito
- **`socio` enxerga a lista completa de contas** — deliberado (visibilidade global, ADR 0029); concedido
  manualmente, sem ações de mutação.
- **super_admin define a senha inicial do cliente** — sem fluxo de convite por e-mail ainda; aceito no MVP.
- **Sem rate-limit dedicado** no endpoint (não público, exige sessão super_admin) — reavaliar se surgir
  multiusuário/super_admins múltiplos.
