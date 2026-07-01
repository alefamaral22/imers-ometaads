# Threat model STRIDE — Planos configuráveis (Onda A)

- **Onda:** A
- **Superfície:** `GET /api/data/plans` (listar), `POST /data/plans` (criar), `PATCH /data/plans/:id`
  (editar/desativar), `PATCH /data/accounts/:id/plan` (atribuir plano), página `/plans`, enforcement em
  `POST /data/clients` e `POST /landing/create`, domínio puro `checkPlanLimit`.
- **Confiança:** só o `super_admin` muta plano (catálogo e atribuição); `socio` lê; `cliente_usuario`
  não acessa. Entrada externa é **dado, não instrução**. O enforcement recai só sobre a account-alvo do
  recurso (o tenant pagante); a agência (visibilidade global) não é limitada.
- **Specs/ADRs:** `SPEC-planos-configuraveis.md`, ADR 0034 (e 0026/0030 para isolamento e provisão).

## Ativos
- Integridade do catálogo (preço/limites/estado ativo de cada plano) — base de cobrança e de tetos.
- Vínculo `accounts.plan_id` e a trilha `plan_changes` (quem trocou o plano de quem, quando, por quê).
- A fronteira de papel (`super_admin` muta; `socio` só lê) e o enforcement de limites por tenant.

## STRIDE

### Spoofing
- **Ameaça:** um não-super_admin (ou sessão forjada) criar/editar plano ou atribuir plano a uma account.
- **Mitigação:** `auth → authz` antes de tudo; toda mutação exige `hasRole(claims,['super_admin'])`;
  a leitura exige visibilidade global (super_admin/socio). Claims vêm de JWT assinado e validado (ADR 0029).

### Tampering
- **Ameaça:** forjar payload para preço/limite negativo, slug malformado, moeda inválida, `features`
  arbitrário, ou alvejar `:id`/`planId` inexistente para corromper vínculo.
- **Mitigação:** `createPlanSchema`/`updatePlanSchema`/`assignPlanSchema` (Zod) validam charset do slug,
  limites `int` não-negativos com teto sanitário, moeda ISO 4217, `features` como objeto; `:id` e
  `planId` validados como uuid; escrita por PostgREST parametrizado (sem SQL string); FK
  `on delete restrict` impede apontar/apagar plano inválido.

### Repudiation
- **Ameaça:** criar/editar plano ou trocar o plano de uma account sem rastro.
- **Mitigação:** `operation_logs` por mutação de plano (`entity_type='plan'`) e de account
  (`entity_type='account'`); troca de plano também grava `plan_changes` (from/to, `changed_by`, reason).

### Information Disclosure
- **Ameaça:** um cliente ler o catálogo/limites de outros tenants; distinguir slug já-existente no erro.
- **Mitigação:** `GET /data/plans` restrito a visibilidade global; leitura sempre server-side (RLS
  fechada ao browser, ADR 0026); colisão de slug responde **409 genérico** (não revela detalhe interno).

### Denial of Service
- **Ameaça:** flood de criação de planos; contagem ao vivo no enforcement como custo por criação.
- **Mitigação:** endpoints atrás de sessão `super_admin`/tenant autenticado (não públicos); a contagem
  é uma leitura simples indexada por `account_id`/`client_id`, sob ator autenticado. (Sem rate-limit
  dedicado: superfície não pública.)

### Elevation of Privilege
- **Ameaça:** um tenant burlar o teto criando recursos além do plano; a agência sendo limitada por
  engano e travando a operação.
- **Mitigação:** enforcement app-layer no serviço de criação (não confia no cliente); `checkPlanLimit`
  é fronteira pura e testada; `hasGlobalVisibility` isenta a agência; LP acima do teto **não vira job**
  (retorna `plan_limit` → 422), fechando o falso-verde de "job completa sem criar".

## Resíduo aceito
- **Enum `accounts.plan` e `plan_id` coexistem** — duas fontes até a fase de remoção do enum; risco de
  divergência mitigado pelo backfill e por a UI/serviços passarem a usar `plan_id`.
- **Só `clients` e `landing_pages` têm enforcement** nesta onda; `max_campaigns`/`max_users` existem no
  schema mas ainda não bloqueiam — teto declarado sem efeito até a fase seguinte.
- **Contagem ao vivo sem cache** no enforcement — aceitável no volume atual; reavaliar com contador
  materializado se o número de recursos por account crescer muito.
