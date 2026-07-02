# CLAUDE.md — guia do projeto para o Claude Code

Agência de tráfego **Meta Ads 100% operada por IAs** (24/7), supervisionada por um operador
humano via dashboard com assistente de voz **Nexus**. A planta completa é o
[`SPEC-000-build-from-scratch.md`](./SPEC-000-build-from-scratch.md). Leia-o antes de qualquer onda.

## Arquitetura em uma frase

Três planos **desacoplados** que só se comunicam pelo banco: **Dashboard** (Vercel/Next.js) enfileira
jobs em `agent_jobs`; **Runner headless** (Fly.io, supercronic + `claude -p`) faz polling, executa
skills e grava o resultado; **Supabase Postgres** é a única fonte da verdade. Nenhum webhook ou
chamada inbound entre planos — só polling + claim atômico + idempotência.

## Como trabalhamos (ondas)

Construção **uma onda por vez** (SPEC §8, Onda 0→11), cada onda um *vertical slice* com **commit
atômico** (Conventional Commits). Antes do código: spec da feature em `docs/specs/<feature>.md` e
ADR (Nygard) em `docs/adr/` para decisão estrutural. Só avance com os **critérios de aceite** verdes.

## Comandos

```bash
npm run lint        # ESLint flat config
npm run typecheck   # tsc --noEmit (estrito)
npm run test        # Vitest
npm run format      # Prettier --check
```

(Por workspace, a partir da Onda 6: `cd web && npm run build`. Banco: `supabase db reset`.)

## Regras invioláveis

- **Segredos** nunca no código; `.env.example` é o contrato; `NEXT_PUBLIC_*` vão ao browser (nada secreto).
- **Meta**: cada tenant conecta sua própria conta de anúncio via token de API (System User), cifrado
  em repouso (`ad_account_connections`), decifrado só server-side no instante da chamada — nunca em
  env, nunca em log. Um cliente pode ter **múltiplas conexões** (múltiplas contas de anúncio); a
  escolha de qual usar é **sempre explícita por job** (nunca fallback implícito — aborta na dúvida).
  O MCP `mcp-meta-ads` compartilhado deixou de ser usado para escrita de campanha (ADR 0035); segue
  disponível só para leitura ao vivo do Nexus (ADR 0032). Campanha **sempre nasce PAUSED**, dentro do
  teto `daily_budget_cap_cents`. Ver gotchas em SPEC §10.
- **Skills headless**: sem `AskUserQuestion`; persistem via REST + `SUPABASE_SECRET_KEY` (não MCP do
  Supabase); manifest JSON + `operation_logs` por mutação; idempotentes.
- **Dinheiro** sempre em inteiro de centavos. **IDs Meta** em `text`.
- Detalhes transversais (segurança, testes, estilo) em [`.claude/rules/`](./.claude/rules/).
