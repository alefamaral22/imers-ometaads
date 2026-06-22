# ADR 0022 — CI/CD no GitHub Actions com gate de qualidade, cobertura e secret scan

- **Status:** Accepted
- **Data:** 2026-06-22
- **Onda:** 11

## Contexto

O projeto tem três planos desacoplados (dashboard Vercel, runner Fly, banco Supabase) e uma
disciplina forte de gates locais (`lint`/`typecheck`/`test`/`format`) e regras transversais (SPEC
§11): tipagem estrita, sem PII em logs, segredos fora do código, testes em `domain/`/`application/`.
Faltava automatizar isso como condição de merge e padronizar o deploy. Forças: (1) impedir regressão
e segredo vazado antes do merge; (2) garantir cobertura mínima da lógica pura; (3) deploy reproduzível
de dois alvos heterogêneos (Vercel e Fly) sem quebrar quem ainda não configurou credenciais.

## Decisão

Usamos **GitHub Actions** com dois workflows.

- **`ci.yml`** (em `push`/`pull_request`) roda os mesmos gates locais + extras: `quality` (`npm ci`
  → format → lint → typecheck → `test:coverage`), `web-build` (`next build` do workspace `web`) e
  `secret-scan` (`gitleaks`). É o **gate obrigatório de merge**.
- **`deploy.yml`** (em `push` na `main` / `workflow_dispatch`) faz `flyctl deploy` e `vercel deploy
  --prod`, cada um precedido de um **secret-check** que faz o job **pular** se o token não existir —
  assim o workflow nunca falha por falta de credencial e não bloqueia merges.

Cobertura é medida por **`@vitest/coverage-v8`** restrita a `domain/`/`application/` (a lógica pura),
com **thresholds abaixo do medido** (folga anti-flaky) que só sobem. Secret scanning por **gitleaks**
com allowlist apenas de placeholders (`.env.example`, docs, fixtures, `REPLACE_WITH_*`). Segredos
são passados por `env` de step (nunca interpolados em shell) e os workflows usam `permissions:
contents: read`.

## Consequências

- **Positivas:** regressão e segredo barrados antes do merge; cobertura da lógica pura garantida;
  deploy padronizado e tolerante à ausência de credenciais; reprodutível (Node 22 + `npm ci`).
- **Negativas / trade-offs:** thresholds globais (não por-arquivo) — um arquivo novo sem teste só
  reprova se derrubar o agregado; deploy via Actions duplica a integração Git da Vercel (escolhemos
  Actions para ter Fly + Vercel no mesmo lugar e gate único).
- **Riscos & mitigação:** falso-positivo do gitleaks → allowlist de placeholders; job de deploy
  vermelho sem segredo → secret-check que pula; `web-build` exigindo env → placeholders públicos
  (build estático não usa segredo).

## Alternativas consideradas

- **Só a integração Git nativa da Vercel + sem CI:** rejeitada — não cobre o runner Fly, nem
  secret scan, nem gate de cobertura.
- **Threshold de cobertura por-arquivo (`perFile`):** adiado — hoje há arquivos de `application/`
  sem teste dedicado (orquestração com I/O); o agregado já protege a lógica pura sem flakiness.
- **`npm audit` como gate bloqueante:** rejeitado nesta onda — vulnerabilidades são de devDeps
  transitivas; um `audit --force` traria breaking changes. Fica como dívida monitorada.
