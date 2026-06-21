# ADR 0005 — Dashboard do operador em Next.js na Vercel, leituras server-side

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 6

## Contexto

O operador humano precisa ver clientes, campanhas, análises, funil e logs. O banco tem RLS
deny-by-default ([[0002-supabase-persistence]]): nenhuma tabela é legível pelo browser. Precisamos de
um app que leia o banco com `service_role` **no servidor** e nunca exponha o segredo ao cliente, com
um plano de execução desacoplado (o dashboard só request/response; trabalho vai para `agent_jobs`).

## Decisão

Dashboard em **Next.js 15 (App Router) na Vercel**. **Toda leitura de tabela é server-side** via
`SUPABASE_SECRET_KEY` (camada `lib/db` + `lib/services/*`), com `server-only` para falhar o build se um
módulo de dados vazar para um Client Component. As páginas protegidas são **`force-dynamic`** (lidas a
cada request, nunca pré-renderizadas). A API usa **Hono** num route handler único
(`app/api/[[...route]]/route.ts`). Cada read é validado por schema Zod que **espelha as colunas das
migrations** — drift de schema vira erro claro, não render errado. UI com Tailwind + primitivos
shadcn-style; o dashboard degrada com elegância quando o banco está indisponível (preview sem env).

## Consequências

- **Positivas:** segredo nunca no browser; RLS continua fechada; SSR sob demanda reflete o estado real;
  contrato de dados tipado ponta a ponta.
- **Negativas / trade-offs:** sem leitura direta no cliente (toda navegação que precisa de dado passa
  pelo servidor); `force-dynamic` desliga cache estático (aceitável p/ um painel interno).
- **Riscos & mitigação:** import acidental de `lib/db` no client → `server-only` quebra o build;
  headers/CSP em [[0006-auth-do-dashboard]].

## Alternativas consideradas

- **Supabase JS no browser com RLS aberta por policy** — rejeitado: violaria deny-by-default e exporia
  superfície de leitura ao cliente.
- **SPA + API separada** — rejeitado: dois deploys e mais superfície; o App Router já une SSR + API.
