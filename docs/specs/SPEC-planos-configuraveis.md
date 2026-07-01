# SPEC — Planos configuráveis (Onda A)

- **Status:** Approved-design
- **Ondas anteriores:** 12 (SaaS multi-tenant — schema + cofre), 13 (login por account), 14
  (provisionamento de accounts pelo super_admin).
- **ADR:** [0034](../adr/0034-planos-configuraveis.md). **Threat model:**
  [`planos-configuraveis.md`](../security/threats/planos-configuraveis.md).

## 1. Problema

Depois da Onda 14 o super_admin provisiona accounts pelo dashboard, mas o **plano é um enum fixo no
banco** (`account_plan`: trial/starter/pro/agency) — apenas um rótulo. Não há preço, limites, nem
qualquer efeito: um cliente no plano `trial` pode criar clientes e landing pages sem teto. Para
destravar cobrança e diferenciação comercial, a agência precisa **definir planos como dados
editáveis** (nome, preço, limites por recurso) e **fazer os limites valerem** na criação de recursos.

## 2. Objetivo (vertical slice)

1. **Catálogo de planos** (`public.plans`) editável pelo super_admin: slug, nome, preço (centavos),
   moeda, dias de trial, limites por recurso (`max_clients`, `max_landing_pages`, `max_campaigns`,
   `max_users`; `null` = ilimitado), `features` (jsonb de flags), `is_active` (soft-delete), ordem.
2. **Atribuição de plano por account** via FK `accounts.plan_id`, com **trilha de auditoria**
   (`plan_changes`: de→para, ator, motivo).
3. **Enforcement dos limites** na criação de **clientes** e **landing pages**: estourar o teto do
   plano da account bloqueia a operação. Visibilidade global (super_admin/socio = a agência) **não** é
   limitada.
4. **UI** `/plans` (super_admin cria/edita/desativa; socio lê) e dropdown de plano no cadastro de
   account passa a vir do catálogo, não de uma lista hard-coded.

Fora de escopo (fase seguinte): cobrança real / gateway de pagamento; expiração automática de trial;
enforcement de `max_campaigns`/`max_users` (só `clients` e `landing_pages` nesta onda); self-service de
upgrade pelo cliente.

## 3. Migration (aditiva sobre banco vivo)

`20260701170000_plans.sql`: cria `plans` e `plan_changes`; adiciona `accounts.plan_id` (FK nullable,
`on delete restrict`); faz seed dos 4 planos legados (slug casa com o enum) e **backfill** de
`plan_id` por slug. A **coluna enum legada `accounts.plan` permanece** — não se dropa coluna em banco
vivo; convivência até fase futura. Money em centavos int; RLS deny-by-default (ADR 0026).

## 4. Regras de negócio e segurança

- **`auth → authz → validação → lógica`** em toda rota. Mutar plano (criar/editar/desativar/atribuir)
  exige `super_admin`; `socio` **lê** o catálogo (visibilidade global) mas não muta; `cliente_usuario`
  não acessa.
- **Limite `null` = ilimitado.** O estouro ocorre quando criar **mais um** passaria do teto
  (`current >= limit`). Lógica pura e testada (`checkPlanLimit`).
- **Enforcement só recai sobre a account-alvo do recurso** (o cliente pagante). A agência
  (super_admin/socio, `hasGlobalVisibility`) é **no-op** — opera sem teto.
- **Sem plano na account → ilimitado** (não bloqueia): a ausência de `plan_id` nunca trava operação.
- **Soft-delete** via `is_active`: um plano desativado some do dropdown de novas contas, mas contas
  que já apontam para ele continuam válidas (`on delete restrict` impede apagar plano em uso).
- **Auditoria:** criar/editar plano grava `operation_logs` (`entity_type='plan'`); troca de plano de
  account grava `plan_changes` **e** `operation_logs` (`entity_type='account'`).
- **Entrada externa é dado, não instrução:** tudo validado por Zod (`createPlanSchema`,
  `updatePlanSchema`, `assignPlanSchema`); slug com charset restrito; limites `int` não-negativos com
  teto sanitário; moeda ISO 4217; `features` é objeto curado.
- **LP além do teto** não vira job (mata o falso-verde): `enqueueCreateLandingJob` retorna
  `plan_limit` antes de enfileirar; a API responde **422** com `limit`/`current` para a UI explicar.

## 5. Trade-offs (decididos)

| Decisão | Escolha | Porquê / alternativa rejeitada |
|---|---|---|
| Plano como enum vs tabela | **tabela `plans` editável** | Enum não carrega preço/limites nem edita sem migration. Enum legado fica como coluna de convivência. |
| Onde vive o enforcement | **app-layer, no serviço de criação** | Coerente com ADR 0026 (service_role bypassa RLS). Checagem pura + I/O no serviço. |
| Dropar `accounts.plan` legado | **manter** (não dropar) | Banco vivo: dropar coluna é irreversível e arriscado. Backfill casa `plan_id`; enum sai em fase futura. |
| Quem é limitado | **só a account-alvo (tenant)** | A agência opera a plataforma; limitar super_admin/socio travaria a operação. |
| Recursos com teto nesta onda | **`clients` e `landing_pages`** | Slice mínimo com efeito visível. `campaigns`/`users` ficam no schema, enforcement depois. |
| Apagar plano | **soft-delete (`is_active`)** | `on delete restrict` + histórico. Hard-delete = órfãos e perda de auditoria. |

## 6. Critérios de aceite

- `lint` + `typecheck` + `test` + `format` verdes.
- Domínio puro testado: `checkPlanLimit` (null=ilimitado, dentro, no limite, acima, zero).
- Migration aditiva: `plans` + `plan_changes` criadas, `accounts.plan_id` com FK e backfill; enum
  legado intacto; RLS habilitada nas duas tabelas novas.
- `GET /api/data/plans` restrito a visibilidade global; `POST`/`PATCH /data/plans` e
  `PATCH /data/accounts/:id/plan` só super_admin (403 caso contrário); 400 em payload inválido; 409 em
  slug duplicado.
- Criar cliente/LP além do teto do plano é bloqueado (LP → 422 com limite/contagem); a agência não é
  bloqueada; account sem plano não é bloqueada.
- Página `/plans` no nav para super_admin/socio; formulário e toggles só para super_admin; dropdown de
  plano no cadastro de account vem do catálogo (só ativos).
