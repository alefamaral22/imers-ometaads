# 0034 — Planos configuráveis (catálogo editável + enforcement de limites)

- **Status:** Accepted
- **Data:** 2026-07-01
- **Onda:** A
- **Contexto relacionado:** ADR 0026 (multi-tenancy app-layer), ADR 0030 (provisionamento de
  accounts), SPEC `docs/specs/SPEC-planos-configuraveis.md`.

## Contexto

Até a Onda 14 o plano de uma account era um **enum fixo** (`account_plan`: trial/starter/pro/agency) —
puro rótulo, sem preço, sem limites, sem efeito. Não dava para diferenciar planos comercialmente nem
impor tetos de uso sem mexer no banco e recompilar. A agência precisa **editar planos como dados** e
que os limites **valham** na criação de recursos, sem quebrar as contas já existentes.

## Decisão

1. **Plano vira tabela** `public.plans` (editável): slug, nome, `price_cents`/`currency`, `trial_days`,
   limites por recurso nullable (`null` = ilimitado), `features` (jsonb), `is_active` (soft-delete),
   `sort_order`. Money em centavos int.
2. **`accounts.plan_id`** é FK aditiva/nullable (`on delete restrict`); a **coluna enum legada
   `accounts.plan` permanece** — não se dropa coluna em banco vivo. Migration faz seed dos 4 planos
   legados e **backfill** de `plan_id` por slug.
3. **Trilha de auditoria** `plan_changes` (de→para, `changed_by`, `reason`) para cada troca de plano de
   account, além do `operation_logs`.
4. **Enforcement app-layer** no serviço de criação (não RLS: `service_role` bypassa). Checagem pura
   `checkPlanLimit` (testável) + I/O no serviço. Estoura quando criar mais um passaria do teto.
5. **A agência não é limitada.** `hasGlobalVisibility` (super_admin/socio) é no-op no enforcement —
   opera a plataforma sem teto. Account **sem plano** também não é bloqueada (ilimitado por ausência).
6. **Recursos com teto nesta onda:** `clients` e `landing_pages`. `max_campaigns`/`max_users` ficam no
   schema, com enforcement adiado.
7. **Authz por papel:** só `super_admin` cria/edita/desativa/atribui plano; `socio` lê o catálogo.

## Consequências

**Positivas:** planos viram alavanca comercial sem deploy; limites reais destravam tiers pagos;
migration 100% aditiva (backfill sem downtime, enum legado intacto); enforcement isolado numa função
pura testável; auditoria de troca de plano de ponta a ponta.

**Negativas / dívidas aceitas:** enum `accounts.plan` e FK `plan_id` **coexistem** (duas fontes até a
fase de remoção do enum); só 2 dos 4 limites são enforçados nesta onda; sem cobrança real nem expiração
automática de trial; a checagem lê contagem ao vivo a cada criação (aceitável no volume atual, sem
cache/contador materializado).

## Alternativas consideradas

- **Manter enum + tabela de config paralela por slug** — rejeitado: duplica a chave e não resolve o
  acoplamento; a tabela `plans` com FK é a fonte única natural.
- **Dropar `accounts.plan` já nesta onda** — rejeitado: dropar coluna em banco vivo é irreversível e
  arriscado; convivência + remoção em fase futura é mais segura.
- **Enforcement por RLS/trigger no banco** — rejeitado: `service_role` bypassa RLS (ADR 0026); o
  controle real é app-layer, coerente com o resto do sistema.
- **Limitar também a agência** — rejeitado: super_admin/socio operam a plataforma; um teto ali travaria
  a própria operação.
