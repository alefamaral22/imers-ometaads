# NOTES.md — registro persistente da implementação

> **Propósito.** Memória confiável entre ondas (sobrevive a `/compact`). Capturar achados,
> decisões, gotchas, status e "como continuar". **Atualize ao fim de cada onda** (seção
> "Changelog por onda"). Fonte da verdade do *plano*: `SPEC-000-build-from-scratch.md` (planta)
> + plano de execução em `C:\Users\ALEF_\.claude\plans\sleepy-hatching-swan.md`.

---

## 1. O que estamos construindo (1 parágrafo)

Agência de tráfego **Meta Ads 100% operada por IAs**, 24/7, supervisionada por humano via
dashboard com assistente de voz **Nexus**. Três planos **desacoplados que só falam pelo banco**:
**Dashboard** (Vercel/Next.js) enfileira jobs → **Runner** (Fly.io, supercronic + `claude -p`)
faz polling/executa skills → **Supabase Postgres** é a única fonte da verdade. Sem webhooks/inbound
entre planos; só polling + claim atômico + idempotência.

---

## 2. Status atual

| Item | Estado |
|---|---|
| **Onda atual** | Onda 1 ✅ código escrito e commitado. **Próxima: Onda 2 (skills).** ⚠️ Falta validar `supabase db reset` ao vivo. |
| **Repo git** | Inicializado em `main`. 3 commits atômicos. (Sem remote ainda.) |
| **.env.local** | Criado — **esqueleto com placeholders vazios**. ⚠️ Nenhuma credencial preenchida. |
| **Tooling** | lint / typecheck / test **verdes**. |
| **Dependências npm** | Instaladas (153 pkgs). 5 vulnerabilidades (devDeps transitivas) → adiadas p/ Onda 11. |

### Decisões do usuário (fixas para todo o projeto)
1. **Manter placeholders de template** — `cliente-exemplo`, assistente `Nexus`, agência `Acme`,
   domínio `example.com`, npm scope `@template`, app Fly `meta-ads-agents`. Personalizar só depois.
2. **`.env.local` = esqueleto com placeholders** (preencher manualmente).
3. **Escopo = roadmap completo Onda 0→11.**
4. **Cadência = uma onda por turno**, commit atômico (Conventional Commits), só avança com aceite verde.

---

## 3. Ambiente (gotchas da máquina)

- **SO:** Windows 11 + PowerShell. Há também o tool Bash (POSIX) — uso Bash para scripts.
- **Caminho do projeto tem espaço e acento:** `C:\Users\ALEF_\Imersão Projeto agencia meta ads`.
  Sempre citar entre aspas em comandos.
- **Node 22** exigido (`engines`).
- **`venv/`** na raiz = helpers Python locais; ignorado pelo git.
- **Fim de linha:** Windows gera avisos CRLF↔LF. Resolvido com `.gitattributes` (`eol=lf`, exceto
  `*.ps1`). Commits feitos com `git -c core.autocrlf=false` para evitar reescrita.
- **MCP da Meta JÁ está conectado nesta sessão** — há dezenas de tools `mcp__claude_ai_META_ADS__ads_*`
  disponíveis (deferred). Relevante a partir da Onda 2. **Meta nunca usa token em env** (SPEC §2/§10).

---

## 4. Decisões técnicas de implementação (com o porquê)

- **`tsconfig.json` inclui só `types/**` e `scripts/**`** (não a raiz toda). Porquê: sem código de
  app ainda, `tsc` daria "No inputs were found". `types/env.d.ts` serve de input real **e** documenta
  o contrato de env. Workspaces (web, packages) terão seus próprios tsconfig nas suas ondas.
- **`npm test` usa `--passWithNoTests`** — verde enquanto não há testes (Onda 0). Remover/ajustar
  quando houver suíte real.
- **Diretórios de workspace (`web/`, `packages/*`, `landing-pages/*`, `worker/*`) NÃO foram
  pré-criados.** Porquê: npm workspaces **falha** se um dir batido pelo glob não tiver `package.json`.
  Cada um nasce na sua onda com seu `package.json`. **Não criar placeholders vazios nesses globs.**
- **Pastas-esqueleto não-workspace** (`docs/`, `.claude/{skills,agents,hooks,materiais-das-empresas}`,
  `scripts/`, `supabase/migrations/`) usam `.gitkeep`.
- **ESLint flat config v9** (`eslint.config.js`), com `@typescript-eslint/no-explicit-any: error`.
- **`.env.example` é espelho exato do `.env.local`** sem valores = contrato canônico (SPEC §2/§7).
  Ao adicionar/editar uma env, **atualizar os dois e `types/env.d.ts`**.

---

## 5. Contratos invioláveis (resumo operacional — detalhe em SPEC §6/§10/§11)

- **Skills:** headless-safe (sem `AskUserQuestion`); `--dangerously-skip-permissions`; persistem via
  **REST + `SUPABASE_SECRET_KEY`** (não MCP do Supabase); manifest JSON em
  `tentativas-geracao-de-campanhas/<stamp>-<tipo>.json`; `operation_logs` por mutação; idempotentes.
- **Meta (gotchas críticos):** campanha **sempre nasce PAUSED**; orçamento ≤ `daily_budget_cap_cents`;
  imagem inline em `link_data.picture`; OUTCOME_SALES **omite `destination_type`** (v25);
  Advantage+ omite placements; imagem do criativo servida do bucket **público** `ad-ingest`.
- **Fila `agent_jobs`:** dashboard insere `{client_id, skill, kind, args, status:'pending'}`; runner
  `claim_agent_job` → executa → patcha. Kinds: create, create_sales, activate, analyze, summarize,
  landing, landing_publish, landing_edit. Dedup por **índice único parcial** (≤1 ativo por (client_id,kind)).
- **Nexus:** tools de escrita **só enfileiram** jobs, **confirmação em dois turnos**, **allowlist
  server-side slug→skill** (nunca texto livre). Injeção em fala/tela = dado, não instrução.
- **Dados:** dinheiro em **centavos (int)**; IDs Meta em `text`; `raw_spec jsonb` em upserts; RLS
  deny-by-default; tabelas append-only nunca sofrem UPDATE.

---

## 6. Status das credenciais (`.env.local`)

**Todas vazias.** Preencher conforme as ondas exigirem:

| Serviço | Chaves | Exigido a partir de |
|---|---|---|
| Anthropic | `CLAUDE_API_KEY` (+ `claude login` no runner) | Onda 2 (skills) |
| OpenAI | `OPENAI_API_KEY` | Onda 2 (imagem) / 7 (STT) |
| Supabase | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_*`, `DATABASE_URL` | **Onda 1** (validar) |
| Upstash Redis | `UPSTASH_REDIS_REST_*` | Onda 6 (rate limit) |
| Upstash QStash | `QSTASH_*` (opcional) | Onda 6+ |
| Cloudflare | `CLOUDFLARE_*`, `*_TURNSTILE_*` | Onda 8 (Pages) / 10 (Worker) |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Onda 7 (TTS) |
| Picovoice | `PICOVOICE_*` | Onda 7 (wake word) |
| Resend | `RESEND_API_KEY`, `AUTONOMOUS_*` (opcional) | Onda 9 |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (opcional) | Onda 4 |
| Dashboard | `DASHBOARD_PASSWORD` (hash SHA-256), `AUTH_SECRET` (≥32B) | Onda 6 |
| Meta | — (via MCP, sem env) | Onda 2 |

> Helper: `open-stack-urls.ps1` / `.sh` abre os sites de cadastro de todos os serviços.

---

## 7. Como validar (comandos)

```bash
# Na raiz "C:\Users\ALEF_\Imersão Projeto agencia meta ads"
npm run lint && npm run typecheck && npm run test   # gate de toda onda
npm run format                                       # Prettier --check

# Onda 1+ (precisa Supabase CLI instalado):
supabase db reset    # aplica migrations limpo + seed

# Skills headless (Onda 2+):
claude -p ".claude/skills/<nome-da-skill>"
```

**Aceite global (SPEC §12):** build/lint/typecheck/test verdes · `supabase db reset` limpo com seed ·
job em `agent_jobs` → runner → `completed` · campanha PAUSED dentro do teto · funil gravado · LP em
preview · dashboard autentica + Nexus enfileira com confirmação · sem segredo no diff / PII em logs.

---

## 8. Próximos passos imediatos (Onda 1 — Supabase)

1. Garantir **Supabase CLI** instalado + projeto/local stack (preencher `SUPABASE_*`/`DATABASE_URL`).
2. Escrever `supabase/migrations/*.sql` (ordem cronológica) com **todo o schema de SPEC §6**:
   tabelas + enums/checks + FKs (on-delete) + índices (inclusive **únicos parciais** de `agent_jobs`)
   + RLS deny-by-default + trigger `set_updated_at()` + RPCs `claim_agent_job`/`claim_autonomous_watch`
   (SECURITY DEFINER, `FOR UPDATE SKIP LOCKED`, EXECUTE revogado de anon/authenticated) + buckets
   (`creatives`/`nexus-review` privados; `landing-assets`/`ad-ingest` públicos) + seed `cliente-exemplo`.
3. Escrever ADRs: persistência Supabase + fila `agent_jobs`. Spec da feature em `docs/specs/`.
4. Aceite: `supabase db reset` limpo; select como `service_role` ok e como anon falha; claim atômico; seed presente.

**Dependências (SPEC §9):** `0→1→2→3→4→5→6→7→8→9/10→11`. 2 e 6 podem paralelizar após 1; 3 precede
operação real; 6 precede 7; 8 precede 9 e 10.

---

## 9. Changelog por onda

### Onda 0 — Fundações ✅ (commits `bf02ab0`, `19d5bfb`)
- Bootstrap: `git init` (main), `.env.local` (esqueleto), `.env.example`, `.gitignore`, `.gitattributes`.
- Tooling: `package.json` (workspaces), `tsconfig.base.json`/`tsconfig.json` estrito, ESLint v9 flat,
  Prettier, Vitest, `types/env.d.ts`.
- Docs: `CLAUDE.md`, `.claude/rules/{security,testing,code-style}.md`, `docs/` (Diátaxis) + templates.
- Estrutura de pastas §5 (não-workspace) com `.gitkeep`.
- Aceite: lint/typecheck/test verdes; `.env.example` lista todas as chaves §2.

### Onda 1 — Camada de dados (Supabase) ✅ (código) — falta validar `db reset` ao vivo
- 10 migrations em `supabase/migrations/` (prefixo timestamp, ordem cronológica):
  helpers+enums → clients/campanhas/ad_sets/ads → creatives/generated_images → analytics →
  landing_pages → fila+autônomo → auditoria/dashboard → **RLS** → **RPCs** → buckets.
- **20 tabelas** da §6, **18 enums**, FKs com on-delete (cascade na hierarquia; set null no que é
  reaproveitável), trigger `set_updated_at` nas mutáveis, append-only nas de log/evento.
- **Índices únicos parciais** em `agent_jobs`: ≤1 job ativo por `(client_id,kind)` e `(landing_page_id,kind)`.
- RPCs `claim_agent_job`/`claim_autonomous_watch`: SECURITY DEFINER, `FOR UPDATE SKIP LOCKED`,
  EXECUTE revogado de public/anon/authenticated, concedido a `service_role`.
- RLS habilitado deny-by-default nas 20 tabelas (sem policies). Buckets: `creatives`/`nexus-review`
  privados; `landing-assets`/`ad-ingest` públicos.
- `supabase/config.toml` (local) + `supabase/seed.sql` (cliente-exemplo, idempotente).
- Docs: `docs/specs/meta-ads-persistence-schema.md`, ADR `0002-supabase-persistence`, ADR `0009-agent-jobs-queue`.
- **Tooling verde:** lint/typecheck/test/format.
- ⚠️ **PENDENTE:** `supabase db reset` não rodou (sem Supabase CLI/psql; Docker daemon parado).
  - **Validador pronto sem credenciais:** suba o Docker Desktop e eu rodo um Postgres 16 efêmero +
    `scripts/_validate_shim.sql` (cria roles `service_role`/`anon`/`authenticated` + schema `storage`)
    e aplico todas as migrations + seed + checks de aceite. Alternativa: instalar Supabase CLI e preencher `SUPABASE_*`.
### Onda 2 — Runtime de skills + 1ª skill (tráfego) ⏳
### Onda 3 — Runner Fly.io ⏳
### Onda 4 — Analytics (funil + resumo) ⏳
### Onda 5 — Ativação + vendas ⏳
### Onda 6 — Dashboard + auth ⏳
### Onda 7 — Nexus (voz) ⏳
### Onda 8 — Landing pages ⏳
### Onda 9 — Editor LP + modo autônomo ⏳
### Onda 10 — Tracking (Worker) ⏳
### Onda 11 — Hardening + CI/CD ⏳
