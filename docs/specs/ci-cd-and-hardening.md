# SPEC — Hardening, observabilidade & CI/CD

- **Onda:** 11
- **Status:** Ready

## Objetivo

Fechar o build colocando o projeto em condição de produção: pipeline de CI obrigatório
(lint + typecheck + test com cobertura + build do web + secret scan), deploy automatizado
(Vercel + Fly) e os requisitos transversais de segurança/observabilidade revisados (SPEC §11/§12).
North-star: nenhum merge entra na `main` sem o gate verde e sem segredo no diff.

## Contratos / entregáveis

- **CI (`.github/workflows/ci.yml`):** três jobs paralelos em `push`/`pull_request`.
  - `quality`: `npm ci` → `format` → `lint` → `typecheck` → `test:coverage`.
  - `web-build`: `typecheck` + `next build` do workspace `web` (NEXT*_PUBLIC*_ placeholders; build
    estático não usa segredo).
  - `secret-scan`: `gitleaks` com `.gitleaks.toml` (histórico completo, `fetch-depth: 0`).
- **Cobertura (`vitest.config.ts` + `npm run test:coverage`):** thresholds mínimos em `domain/` e
  `application/` (statements/lines ≥ 55, branches/functions ≥ 70 — abaixo do medido, com folga).
  Provedor `@vitest/coverage-v8`.
- **Secret scan (`.gitleaks.toml`):** estende as regras default; allowlist só para PLACEHOLDERS
  (`.env.example`, `docs/`, fixtures `*.test.ts`, `wrangler.toml`, `REPLACE_WITH_*`).
- **Deploy (`.github/workflows/deploy.yml`):** em `push` na `main` / `workflow_dispatch`. Jobs `fly`
  (`flyctl deploy --remote-only`) e `vercel` (`vercel deploy --prod`). Cada job **degrada para skip**
  se o segredo (`FLY_API_TOKEN` / `VERCEL_TOKEN`) não estiver configurado — nunca falha por falta de
  credencial (não bloqueia merge).
- **`vercel.json`:** `framework: nextjs`, `regions: [gru1]`, build do monorepo (`--workspace web`) e
  **cron declarativo** chamando `/api/health` (liveness NO-PII) a cada 10 min.
- **`/api/health` público:** liberado no `middleware.ts` (sem sessão; só `{ ok: true }`).

## Comportamento

- **Gate de merge:** os três jobs de `ci.yml` precisam passar. `concurrency` cancela runs antigos do
  mesmo ref.
- **Deploy idempotente/seguro:** roda só após merge na `main`; secret-check antes de qualquer checkout.

## Segurança & observabilidade (revisão SPEC §11)

- **Secret scanning** no CI (gitleaks) + `.env.example` como contrato sem valores; segredos só em
  `fly secrets` / Vercel env / `wrangler secret` — nunca no diff.
- **Permissions mínimas** nos workflows (`contents: read`); segredos passados por `env` de step
  (nunca interpolados em shell — evita injeção).
- **Rate limits revisados:** login + Nexus (Upstash, Onda 6/7), `/e` do tracking por IP (Onda 10).
- **Observabilidade:** logs estruturados sem PII e correlation id já em `agent_events.run_id`
  (runner) e nos logs `{event, detail}` do Worker; `lp_events`/D1 sem PII (flags/hashes). Nada novo
  a persistir — esta onda só revisa e documenta.
- **Threat models STRIDE** por superfície: pipeline CI/CD (`docs/security/threats/ci-cd-supply-chain.md`)
  e dashboard web (`docs/security/threats/web-dashboard.md`).

## Critérios de aceite

- [ ] CI (`ci.yml`) verde obrigatório para merge: `format` + `lint` + `typecheck` + `test:coverage`
      + `web-build` + `secret-scan`.
- [ ] `npm run test:coverage` passa os thresholds de `domain/`/`application/`.
- [ ] gitleaks não acusa segredo no diff (allowlist só de placeholders).
- [ ] Deploy roda na `main` e **pula** graciosamente sem segredos.
- [ ] `vercel.json` declara crons + região; `/api/health` acessível sem sessão.
- [ ] `lint` + `typecheck` + `test` + `format` verdes.
