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

> **Duas dimensões distintas:** (A) **Build do código** = Ondas 0→11 **100% completas** (gates
> locais verdes). (B) **Go-live (produção)** = em andamento (~70%), rastreado em
> `docs/how-to/go-live.md` (6 fases). NÃO confundir "build completo" com "no ar".

### A) Build do código — Ondas 0→11 ✅

| Item | Estado |
|---|---|
| **Ondas** | 0,1 ✅ + **2 ✅** + **3 ✅** (runner Fly) + **4 ✅** (analytics) + **5 ✅** (ativação+vendas) + **6 ✅** (dashboard) + **7 ✅** (Nexus voz/chat) + **8 ✅** (LP pacote+template+skills) + **9 ✅** (editor LP + autônomo) + **10 ✅** (tracking Worker) + **11 ✅** (hardening+CI/CD). |
| **Banco real** | Supabase `yjmngxsdfsxtzjastvwi`: 20 tabelas c/ RLS + RPCs + 4 buckets + seed `cliente-exemplo` (cap 5000 cents, BRL). Aceite da Onda 1 validado ao vivo via MCP. |
| **Tooling** | lint / typecheck / test (211+) / format / `next build` **verdes**. |

### B) Go-live (produção) — em andamento (atualizado 2026-06-23)

Mapeamento das 6 fases do `docs/how-to/go-live.md`:

| Fase | Estado |
|---|---|
| 0 — Remote GitHub + CLIs | ✅ Remote `origin` = `github.com/alefamaral22/imers-ometaads` (privado); `main` empurrada. `gh`/`flyctl`/`vercel` ok |
| 1 — Supabase | ✅ Provisionado, validado, `SECRET_KEY` distribuído |
| 2 — **Runner Fly** (`imers-ometaads`, gru) | ✅ **No ar 24/7** (build local; supercronic + pollers 1/min). Skills no `/app/.claude/skills`. |
| 3 — Primeiro job real | ✅ `job→runner→completed` validado (skill `daily-summary`). 🔄 ciclo Meta enfileirado: ver §10 |
| 4 — Cloudflare Worker (tracking) | ❌ Não feito |
| 5 — **Dashboard Vercel** (`meta-ads-dashboard`, `topaz-theta`) | ✅ **No ar**, login + leitura real do Supabase OK (plano Hobby → cron diário) |
| 6 — CI/CD (secrets GitHub) | ✅ **Completo**: CI verde no push; **deploy auto Fly + Vercel validado ao vivo** (workflow_dispatch → ambos os jobs success). 4 secrets setados (`FLY_API_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). Push na `main` redeploya runner + dashboard sozinho. ⚠️ `VERCEL_TOKEN` foi colado em texto no chat → **rotacionar** quando der |

**🟢 Risco rebaixado (2026-06-23):** o **MCP da Meta FUNCIONA no runner** — `claude mcp list` na
máquina Fly mostra `claude.ai META ADS … ✔ Connected` (via connector de conta do `claude login`, **não**
via `.mcp.json`; o `.mcp.json` do runner só tem Supabase, que as skills nem usam). A campanha de tráfego
do `cliente-exemplo` (stamp `20260623-0111`) foi criada **pelo runner** — prova de que `create-traffic`
roda ponta a ponta no headless. Era a maior incerteza do projeto; está resolvida.

**Bug do criativo (resolvido nesta sessão):** os 3 criativos nasceram como PNG de cor sólida porque a
`image-generate` caiu em placeholder (não chamou a OpenAI). Diagnosticado, 3 imagens reais regeneradas
(`gpt-image-1`), 3 criativos novos na Meta + ads repontados (PAUSED), skill endurecida (commit `3720f6e`,
proíbe placeholder + gera via Node) e **runner redeployado**. Detalhe em [[image-generate-placeholder-gotcha]].

**Ciclo Meta enfileirado — VALIDADO ao vivo (2026-06-23):** job `create` enfileirado → runner →
campanha `OUTCOME_TRAFFIC` **PAUSED** + ad_set + 3 ads + 3 criativos + 3 imagens `gpt-image-1` reais,
orçamento clampado no teto (631s). Bug do falso-verde do `run-skill.sh` corrigido no caminho — ver
[[runner-false-green-prompt]].

**Pendências do go-live (ordem de prioridade):** (1) **Cloudflare Worker** de tracking (fase 4 — precisa
conta CF + domínio); (2) trocar `example.com` pelo domínio real; (3) `.env.example` espelhar
`TTS_PROVIDER`/`MINIMAX_*`; (4) rotacionar senha `nexus-local` e o `VERCEL_TOKEN` (exposto no chat).

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

### Decisões da Onda 1 (schema Supabase) — com o porquê

- **Postgres `enum` (não `CHECK`) para domínios fechados** (18 tipos). Porquê: vira contrato validado
  pelo banco e legível. Trade-off: evoluir um valor exige migration (`ALTER TYPE ... ADD VALUE`).
- **`bigint` para `*_cents` que acumulam** (spend/value/cpc/cpm/results) e **`integer`** para
  tetos/preços de campanha (`daily_budget_cap_cents` default 5000). Estimativa de custo de imagem em
  `numeric` (não é ledger).
- **`finding_severity` = `positive/info/warning/critical`** — a SPEC §6 não fixou os valores; **estes
  foram escolhidos por nós**. ⚠️ Código da Onda 4 (analytics) deve usar exatamente estes.
- **FK on-delete:** hierarquia **cascateia** (campaigns→clients, ad_sets→campaigns, ads→ad_sets,
  filhos de analyses, sections→landing_pages, narrations→watches); referências **reaproveitáveis** usam
  **`set null`** (`ads.creative_id`, `creatives.generated_image_id`, `landing_pages.product_id`,
  `agent_jobs.landing_page_id`, `autonomous_watches.agent_job_id/publish_job_id`).
- **FK `ads.creative_id` é adicionada na migration de criativos** (não na de `ads`) para evitar
  dependência circular entre `ads` ↔ `creatives`.
- **Append-only** (só `created_at`, sem trigger): `analyses` + filhos (`metric_snapshots`,
  `analysis_findings`, `funnel_events`), `operation_logs`, `agent_events`, `nexus_narrations`, `lp_events`.
- **Seed via `supabase/seed.sql` + `[db.seed]` no `config.toml`** (não dentro de migration). Roda no
  `supabase db reset`, idempotente (`on conflict (slug) do nothing`).
- **RLS deny-by-default = só `ENABLE ROW LEVEL SECURITY`, zero policies.** `service_role` tem `BYPASSRLS`
  no Supabase → acessa tudo; `anon`/`authenticated` sem policy → leitura vazia. **Toda tabela nova
  precisa de uma linha em `…120700_rls.sql`.**
- **Migrations com prefixo timestamp** `20260620HHMMSS_*.sql` (ordem cronológica/lexicográfica). Para
  adicionar schema, criar nova migration com timestamp **maior** — nunca editar migration já aplicada.
- **Validador local sem credenciais:** `scripts/_validate_shim.sql` cria `service_role`/`anon`/
  `authenticated` + schema `storage` num Postgres puro, permitindo aplicar as migrations via Docker
  efêmero sem o stack Supabase completo. (Não é migration do projeto.)
- **SPEC-000 corrigido nesta sessão** (mantê-lo "spec-driven sempre atualizado"): §2 ganhou
  `TELEGRAM_BOT_TOKEN`; árvore §5 ganhou `.claude/rules/`; §8 ganhou ponteiro de status → NOTES.md.

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

## 8. Próximos passos imediatos

### 8a. Fechar o aceite da Onda 1 (validação ao vivo — PENDENTE)
O código da Onda 1 está commitado, mas falta provar `supabase db reset`. Caminho **sem credenciais**
(preferido): subir o **Docker Desktop** e pedir ao Claude para rodar a validação por Postgres efêmero
+ `scripts/_validate_shim.sql` (aplica todas as migrations + seed e checa: seed presente; claim
atômico; índice parcial bloqueando duplicata; `anon` sem leitura). Alternativa: instalar **Supabase
CLI** + preencher `SUPABASE_*`/`DATABASE_URL` e rodar `supabase db reset`.

### 8b. Onda 2 — Runtime de skills + 1ª skill (tráfego)
1. `lista-de-clientes`, `lista-de-produtos`; briefs em `materiais-das-empresas/<cliente>/produtos/`.
2. Subagents `scrape-extractor`, `copywriter`, `image-prompt-generator`; skill `image-generate`.
3. Skill `create-traffic-cliente-exemplo-campaign`: scrape → copy (3 ângulos: autoridade/dor/oferta)
   → 3 criativos → cria via **MCP da Meta SEMPRE PAUSED** dentro de `daily_budget_cap_cents`; imagem
   inline em `link_data.picture`; imagem servida do bucket público `ad-ingest`.
4. **Persistência via REST + `SUPABASE_SECRET_KEY`** (headless **não** usa MCP do Supabase) + manifest
   JSON em `tentativas-geracao-de-campanhas/<stamp>-<tipo>.json` + `operation_logs` por mutação; idempotente.
5. Grava em `campaigns/ad_sets/ads/creatives/generated_images/operation_logs` (schema da Onda 1).
6. **MCP da Meta já conectado nesta sessão** (`mcp__claude_ai_META_ADS__ads_*`) — relevante aqui.
- **Aceite:** `claude -p ".claude/skills/create-traffic-cliente-exemplo-campaign"` cria campanha PAUSED,
  grava linhas + manifest; nada fora do teto; re-rodar não duplica gasto.

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
- ✅ **VALIDADO AO VIVO (via MCP, 2026-06):** o schema já está aplicado no projeto Supabase real
  `yjmngxsdfsxtzjastvwi` — `list_tables` mostra as **20 tabelas com RLS habilitado**; as RPCs
  `claim_agent_job`/`claim_autonomous_watch`/`set_updated_at` existem; os 4 buckets estão criados
  (`ad-ingest`/`landing-assets` públicos, `creatives`/`nexus-review` privados); e o **seed
  `cliente-exemplo`** está presente (1 linha; cap 5000 cents, BRL, landing `cliente-exemplo.example.com`).
  Não foi necessário `supabase db reset` — o aceite da Onda 1 está satisfeito no banco real.
### Onda 2 — Runtime de skills + 1ª skill (tráfego) ✅ (commit `aa9a0ab`)
- Lógica pura testável `scripts/onda2/` (domain/app/infra): ângulos (3: authority/pain/offer),
  clamp de orçamento ≤ teto, payloads Meta (PAUSED, OUTCOME_TRAFFIC), persistência REST
  (`upsertRow` merge-duplicates → idempotente; `insertRow` para `operation_logs`), manifest.
- Skills `.claude/skills/`: `lista-de-clientes`, `lista-de-produtos`, `image-generate`,
  `create-traffic-cliente-exemplo-campaign` (headless-safe, allowed-tools declaradas, Meta só via MCP).
- Subagents `.claude/agents/`: `scrape-extractor`, `copywriter`, `image-prompt-generator`
  (conteúdo externo = dado, não instrução). Brief `curso-exemplo` (ADR 0014). Spec + threat model.
- ⚠️ Não exercitado ao vivo (sem credenciais Meta/Supabase/OpenAI); lógica coberta por testes Vitest.
### Onda 3 — Runner Fly.io ✅ (commit `7fc7cfd`)
- Infra: `Dockerfile` (node:22 + supercronic + Claude Code CLI + wrangler + tsx + python3 + tini),
  `fly.toml` (app `meta-ads-agents`, gru, **sem HTTP inbound**, volume `claude_oauth` p/ OAuth),
  `crontab` (poll 1/min + skill de tráfego diária 09:00 UTC).
- Bash fino: `scripts/poll-agent-jobs.sh` (lock `mkdir` + `trap`), `scripts/run-skill.sh`
  (`claude -p ... stream-json` | `tee` log | `emit-from-stream.ts`).
- **Lógica em TS testável** `scripts/runner/`: claim atômico via RPC `claim_agent_job`, validação de
  skill (allowlist on-disk) + args (charset seguro anti-shell), transições
  pending→running→completed/failed, mapeamento stream-json→`agent_events` (PII-safe), bookends
  start/end garantidos. **30 testes** (domain + infra com `fetch` fake).
- Hook opcional `emit-agent-event.py` (Python stdlib, self-guarding, opt-in `RUNNER_HOOKS=1`) +
  `.claude/runner-settings.json`. ADR 0001 + SPEC flyio-cron-campaign-runner + threat model STRIDE.
- **Decisão:** runner é TS-first (não Python) para ter cobertura no gate; documentado no ADR 0001.
- ⚠️ Não exercitado ao vivo: sem `docker build`/deploy Fly e sem credenciais. `bash -n` ok nos scripts;
  lógica coberta por testes. Validação real: `fly deploy` + inserir job em `agent_jobs` → ver `completed`.
### Onda 4 — Analytics (funil + resumo diário) ✅ (commit nesta onda)
- Lógica pura testável `scripts/onda4/` (domain/app/infra): funil de 7 etapas (`computeFunnel`: CVR
  from_prev/from_top, custo por evento, divisão-por-zero→null), snapshot de métricas (`buildSnapshot`:
  currency→cents, ctr/cpc/cpm derivados, "sem dado"=null), diagnóstico (`diagnose` cruza ≥2 métricas
  ancorado no north-star; `overallVerdict`), plano de análise + resumo diário (ROAS, vereditos).
  **37 testes** Vitest.
- Infra `analytics-rest.ts`: `insertReturning` (id de `analyses`) + `insertMany` (filhos append-only em
  lote) — reusa `readSupabaseConfigFromEnv` da Onda 2; REST + `SUPABASE_SECRET_KEY`, nunca MCP do Supabase.
- Skills `.claude/skills/`: `funnel-analytics-cliente-exemplo-campaign` (**read-only na Meta** —
  allowed-tools só `ads_get_*`/`ads_insights_*`, zero writes) e `daily-summary-cliente-exemplo`
  (upsert idempotente; Telegram opcional log-only). Crons 10:00 e 10:30 UTC no `crontab`.
- Docs: spec `meta-ads-funnel-analytics`, ADR 0025 (funil) + 0024 (análise diária), threat model STRIDE.
- ⚠️ Não exercitado ao vivo (sem credenciais Meta/Supabase); lógica coberta por testes determinísticos.
### Onda 5 — Ativação + campanha de vendas ✅ (commit nesta onda)
- Lógica pura testável `scripts/onda5/` (domain/app/infra): `evaluateActivation` (**default-deny**:
  right_client/has_meta_id/currently_paused/cap_positive/has_entities/budget_within_cap — aborta na
  dúvida), payloads OUTCOME_SALES (`buildSalesAdSetPayload` **omite destination_type** v25, pixel
  PURCHASE, OFFSITE_CONVERSIONS), `selectTopCreatives` (por compras→gasto, só reutilizáveis),
  `buildSalesPlan` (reusa criativos, clampa teto). **24 testes** Vitest.
- Infra `meta-rest.ts`: `patchById` (status PAUSED→ACTIVE no banco). Vendas reusa `upsertRow`/`insertRow`
  da Onda 2. REST + `SUPABASE_SECRET_KEY`, nunca MCP do Supabase.
- Skills `.claude/skills/`: `activate-campaign-cliente-exemplo` (least privilege: só
  `ads_activate_entity`/`ads_update_entity`; lê estado do banco e revalida) e
  `create-sales-cliente-exemplo-campaign` (OUTCOME_SALES PAUSED, reuso, idempotente). **Operador-triggered,
  não cron** (ativação = gasto real, confirmação no Nexus/Onda 7).
- Docs: spec `meta-ads-activation-and-sales`, ADR 0007 (ativação default-deny) + 0008 (vendas reusa),
  threat model STRIDE.
- ⚠️ Não exercitado ao vivo (sem credenciais Meta/Supabase); lógica coberta por testes determinísticos.
### Onda 6 — Dashboard + auth ✅ (commit `2c2d8b4`)
- `web/` Next.js 15 (App Router) + Tailwind: middleware (CSP nonce + headers), auth (senha SHA-256 +
  cookie JWT + Turnstile opcional), rate limit no login, `lib/services/*` server-side via service_role
  (RLS fechada ao browser), env validado por Zod, API Hono em `app/api/[[...route]]`.
- Páginas: overview, analyses, funnel, landing-pages, clients/[slug] (force-dynamic, degradam sem
  banco) + login. `next build` verde (todas as rotas + middleware). ADRs 0005/0006.
### Onda 7 — Nexus (voz/chat) ✅ (commit nesta onda)
- Núcleo puro testável `web/lib/nexus/domain/`: `allowlist` (slug→skill/kind, deny-by-default),
  `args` (charset restrito anti-shell + `compactArgs`), `confirmation` (dois turnos, token em tempo
  constante), `enqueue` (linha `agent_jobs`), `tools` (read/write), `prompt`, `memory`, `requests`
  (Zod). **18 testes** Vitest (rodam pelo root vitest, include `web/**/*.test.ts`).
- Infra server-only `web/lib/nexus/infra/`: `anthropic` (Messages API via fetch, **sem SDK**),
  `chat-runner` (dispatch read direto / write propõe / confirm enfileira), `voice` (Whisper/ElevenLabs),
  `vision` (descrição de tela), `agent-jobs` (enqueue; trata 409 do índice único como "já ativo").
- API Hono `app/api/[[...route]]`: `POST /nexus/{chat,confirm,stt,tts,capture}` + `GET /nexus/narrations`,
  protegidos (auth→authz→`limitNexus`→Zod→lógica); degradam 503 sem chaves.
- UI `web/components/nexus/`: `nexus-widget` (chat + barra Confirmar/Cancelar + push-to-talk),
  `use-voice` (MediaRecorder→STT, TTS), `visualizer`; ligado ao `Shell`.
- env (web): CLAUDE/OPENAI/ELEVENLABS_* + NEXUS_MODEL opcionais + flags; `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY`.
- Docs: SPEC-016, ADR 0010 (enqueue/confirm/allowlist) + 0011 (voz STT/TTS) + 0016 (visão de tela),
  threat model STRIDE. **Decisão:** Nexus só ENFILEIRA (escrita = agent_jobs pending); runner executa.
- ⚠️ Não exercitado ao vivo (sem CLAUDE/OPENAI/ELEVENLABS keys); lógica de segurança 100% testada;
  `next build` verde. Wake-word: push-to-talk nesta onda (Picovoice fica como drop-in futuro).
### Onda 8 — Landing pages ✅ (completa: pacote+template+skills) (commits `8a8c2ba` + cont. nesta onda)
- `packages/lp-render` (`@template/lp-render`): ContentDoc/Theme/Settings (Zod), **17 seções**,
  serializer puro/determinístico → `content-spec.json`+`messages/pt.json`+`theme.css` (golden tests) +
  CLI `tsx`, libs (checkout/utm/consent/affiliate).
- `landing-pages/_template`: Next.js `output:export`, 17 renderizadores, consome `generated/`,
  `next build` verde (out/ estático). ADRs 0012/0013/0015/0017 + SPEC-011.
- ✅ **Continuação (nesta sessão, junto da Onda 9):** `scripts/onda8/` (invariantes do rascunho +
  linhas de persistência + `assembleContentDoc`/`publishPatch`; 12 testes); subagents
  `landing-page-architect`/`lp-copywriter`; skills `create-landing-page-cliente-exemplo` (rascunho
  noindex + enfileira `landing_publish`) e `publish-landing-page-cliente-exemplo` (serializa do banco →
  `next build` → wrangler Pages deploy).
### Onda 9 — Editor de landing + modo autônomo do Nexus ✅ (commit nesta onda)
- Editor (web): `lib/landing/edit.ts` (edit-path anti prototype-pollution, `reconcile` por versão,
  schemas Zod; 5 testes); serviços `landing-sections` (edição síncrona com concorrência otimista) e
  `watches`; API `POST /api/landing/{section,autonomous}` (protegidos); `components/landing/section-editor`
  + rota `app/landing-pages/[id]`. Helper `patchRows` no db client.
- Autônomo (runner): `scripts/onda9/` máquina de fases `watching→reviewing→notifying→done` (`tickWatch`
  ≤1 narração/tick, idempotente por cursores) + `planTick`; 8 testes. Infra `runner/infrastructure/watches.ts`
  + `runner/poll-watch-once.ts` (mecânico, sem LLM); skill `autonomous-watch-tick`;
  `scripts/poll-autonomous-watches.sh`; cron 1/min no `crontab`.
- Live review: `scripts/screenshot-page.cjs` (Playwright, **SSRF-guard** `*.example.com`),
  `scripts/send-email.cjs` (Resend, **fail-safe** log-only).
- Docs: spec landing-editor-and-autonomous, ADR 0019 (modo autônomo) + 0020 (live review), threat model.
- ⚠️ Não exercitado ao vivo (sem credenciais/Playwright/Resend); lógica de decisão 100% testada.
### Onda 10 — Tracking server-side (Cloudflare Worker) ✅ (commit nesta onda)
- Workspace `worker/track` (npm workspace `@template/worker-track`): Worker servindo `POST /e` em
  `track.example.com`, espelho **NO-PII** em `lp_events` e fan-out CAPI/GA4.
- Lógica pura testável (gate raiz, **35 testes**): `domain/` — `origin` (CORS deny-by-default,
  boundary por ponto anti look-alike), `event` (parse/validação hand-rolled, allowlist de
  `event_type`, opcional inválido→null, strip de control-chars por codepoint), `pii` (normalização
  p/ hash + flags de presença), `ratelimit` (janela fixa pura), `lp-event-row` (**fronteira de PII**:
  enumera só colunas NO-PII; teste falha se surgir chave de PII). `application/` — `fanout` (builders
  CAPI v21 + GA4 MP, destinos fixos anti-SSRF, PII só hasheada, Google Ads via importação GA4 c/
  `gclid`), `handle-event` (orquestra com ports; mirror awaited+idempotente, efeitos em background
  fail-safe).
- Infra (glue Cloudflare, lint+prettier ok; fora do typecheck/test do gate raiz): `worker.ts` (fetch
  handler, IP/país da borda, `ctx.waitUntil`), `crypto` (SHA-256 Web Crypto), `supabase` (upsert
  `lp_events` REST `on_conflict=event_id`), `d1` (`INSERT OR IGNORE`, só hashes), `dispatch`
  (`allSettled`). `wrangler.toml` (route `track.example.com`, KV `RATE_LIMIT`, D1 `TRACK_DB`, vars) +
  `schema.sql` (D1) + README.
- **Decisões:** lógica hand-rolled sem deps externas (como `scripts/*`) → coberta pelo vitest raiz sem
  `wrangler`/miniflare; segredos via `wrangler secret` (nunca no `.toml`); Google Ads via GA4
  (evita Google Ads API/OAuth no Worker). Docs: SPEC-015, ADR 0021, threat model `landing-page-tracking`.
- ⚠️ Não exercitado ao vivo (sem bindings KV/D1 nem `wrangler deploy`); lógica 100% testada.
### Pós-Onda 11 — TTS plugável (ElevenLabs | MiniMax) ✅ (commit nesta sessão)
- `web/lib/nexus/domain/tts.ts` (puro, **15 testes**): `resolveTtsProvider` (default elevenlabs),
  allowlist de vozes PT da MiniMax (`resolveMinimaxVoice` deny-by-default), clamps speed/pitch/vol,
  `buildMinimaxBody` (`speech-02-turbo`, `language_boost: 'pt'`, params fixos de produção),
  `parseMinimaxResponse` (`base_resp.status_code===0`) e `hexToBytes` (HEX→MP3).
- `voice.ts`: `synthesize(text, opts)` despacha por `pickTtsProvider` (**default MiniMax**, ElevenLabs
  como fallback ciente de credencial); os dois devolvem `audio/mpeg` → rota `/api/nexus/tts` e cliente
  inalterados. Chave da MiniMax só no servidor (`Authorization: Bearer`, `api.minimax.io/v1/t2a_v2`).
- Envs novas: `TTS_PROVIDER`, `MINIMAX_API_KEY`, `MINIMAX_VOICE_ID` (em `web/lib/env.ts`,
  `types/env.d.ts`; **falta espelhar no `.env.example`** — bloqueado por permissão nesta sessão).
  `ttsRequestSchema` aceita voice/speed/pitch/vol; widget ganhou seletor de voz PT (default
  `Portuguese_Solemn_Narrator_v1`). `isTtsEnabled` considera o provedor ativo. ADR 0011 atualizado.
- Gates verdes: lint, typecheck (raiz + web), 211 testes, format, `cd web && next build`.
### Pós-Onda 11 — Nexus mãos-livres (conversa por voz contínua / VAD) ✅ (commit nesta sessão)
- **Sintoma do operador:** "o chat só funciona por texto". **Diagnóstico:** (1) o código já fala — TTS
  MiniMax é o default e `nexus-widget` chama `voice.speak` em toda resposta; o "só texto" vem da
  **degradação silenciosa** quando as chaves de voz **não estão setadas no env da Vercel** (STT precisa
  `OPENAI_API_KEY`; TTS precisa `MINIMAX_API_KEY`+`TTS_PROVIDER=minimax`; chat precisa `CLAUDE_API_KEY`).
  Localmente as chaves existem em `web/.env.local`. (2) **Mãos-livres não existia** — só push-to-talk.
- **Construído:** modo **mãos-livres** com **VAD** (escuta contínua). Núcleo puro testável
  `web/lib/nexus/domain/vad.ts` (`vadStep` máquina `idle→speaking→trailing`, `rmsFromTimeDomain`,
  `DEFAULT_VAD_CONFIG`; descarta ruído curto + teto duro; **9 testes**). Hook `use-voice` ganhou
  `startHandsFree`/`stopHandsFree`/`setHandsFreePaused`/`transcribeBlob` + `speaking`/`listening`:
  abre o mic via `AnalyserNode` (Web Audio), amostra RMS a cada 50ms, grava o segmento entre
  `speech-start`/`utterance-end`, transcreve e dispara o turno. **Anti-eco:** `speak` agora resolve só
  quando o áudio TERMINA e a escuta auto-pausa enquanto o Nexus fala/processa. Widget ganhou o toggle
  "Mãos-livres" + indicador de estado (Ouvindo/Processando/Falando); push-to-talk fica oculto no modo ON.
- Gates verdes: lint, typecheck (raiz + web), **229 testes**, `cd web && npm run build`. Docs: SPEC-016
  (entregáveis+aceite) e ADR 0011 atualizados.
- **Gotcha de header (corrigido):** em produção o mic não abria e a voz não tocava por causa dos headers
  de segurança em `web/lib/security/headers.ts`: `Permissions-Policy: microphone=()` **bloqueava o mic
  em toda origem** (clique não fazia nada) e faltava `media-src 'self' blob:` no CSP (o áudio do TTS toca
  de um `blob:` URL → cairia no `default-src 'self'`). Fix: `microphone=(self)` + `media-src` com `blob:`
  (câmera/geo seguem desabilitadas). Widget passou a mostrar mensagem amigável se o mic for negado.
  **Precisa redeploy na Vercel** para o header novo valer.
- **Visibilidade do Nexus (contas/campanhas):** o assistente do dashboard lê o **espelho no banco**, não
  a Meta ao vivo (dashboard não tem token Meta — só o runner, via MCP). `get_clients` já trazia as contas
  (`ad_account_id`); faltava expor campanhas → adicionada a read tool **`get_campaigns`** (status,
  orçamento, objetivo, `meta_campaign_id`; filtro opcional por client_slug) + prompt orientado a
  consultá-las. **Limite por design:** o Nexus só "vê" o que as skills criaram/persistiram no banco; para
  enxergar campanhas que existem só na Meta seria preciso uma skill de **sync** no runner (não construída).
- **Erro "Não consegui processar agora" (corrigido):** o chat caía nesse erro porque (a) `callMessages`
  lançava erro cru em QUALQUER resposta não-OK da Anthropic e a rota só tratava `NexusUnavailableError`
  (→ 500), sem retry — um "overloaded" (529) transitório derrubava o turno; e (b) o `runChatTurn` só
  tratava UMA rodada de tool, mas o prompt agora manda consultar get_clients/get_campaigns antes de agir
  (2+ idas ao modelo) → a proposta de ação na 2ª rodada era perdida. Fix: **retry** de status transitórios
  (429/500/502/503/529 + falha de rede, backoff) virando 503 amigável; **loop agêntico** (até 5 rodadas,
  trata todos os tool_use por rodada). Widget: mensagens distintas p/ 503 e 429.
- ⚠️ **Ação de config pendente (fora do código):** setar na **Vercel** as envs `CLAUDE_API_KEY`,
  `OPENAI_API_KEY`, `TTS_PROVIDER=minimax`, `MINIMAX_API_KEY`, `MINIMAX_VOICE_ID` (ex.:
  `Portuguese_Solemn_Narrator_v1`) e **redeployar** — sem isso a voz degrada para texto em produção.
  Mic exige **HTTPS** (a Vercel já é). `.env.local` raiz tem `MINIMAX_VOICE_ID` inválido (ignorado; o web
  usa `web/.env.local`, correto).

### Onda 11 — Hardening, observabilidade & CI/CD ✅ (commit nesta onda)
- **CI** `.github/workflows/ci.yml` (push/PR, gate de merge): jobs `quality` (npm ci → format → lint
  → typecheck → `test:coverage`), `web-build` (typecheck + `next build` do workspace web com
  NEXT_PUBLIC_* placeholders) e `secret-scan` (gitleaks, `fetch-depth: 0`). `concurrency` +
  `permissions: contents: read`.
- **Deploy** `.github/workflows/deploy.yml` (push main / manual): jobs `fly` (`flyctl deploy`) e
  `vercel` (`vercel deploy --prod`), cada um com **secret-check que pula** se o token faltar (nunca
  falha por falta de credencial). Segredos só via `env` de step (anti-injeção).
- **Cobertura:** `@vitest/coverage-v8` + `npm run test:coverage`; thresholds em `domain/`/`application/`
  (statements/lines 55, branches/functions 70 — medido 60.2/87.2/84.9/60.2, com folga). `test` default
  segue sem coverage (gate rápido).
- **Secret scan:** `.gitleaks.toml` (estende default; allowlist só de placeholders: `.env.example`,
  `docs/`, fixtures `*.test.ts`, `wrangler.toml`, `REPLACE_WITH_*`).
- **`vercel.json`:** framework nextjs, region gru1, build do monorepo (`--workspace web`), **cron**
  `/api/health` a cada 10 min. `/api/health` liberado no `web/middleware.ts` (liveness público NO-PII).
- **Threat models:** `ci-cd-supply-chain.md` (superfície nova) + `web-dashboard.md` (lacuna da Onda 6).
  Docs: spec `ci-cd-and-hardening`, ADR 0022. Observabilidade já coberta (`agent_events.run_id`; logs
  NO-PII no Worker) — onda só revisa/documenta.
- **Decisão:** `npm audit` NÃO é gate (devDeps transitivas; `--force` = breaking) — dívida monitorada.
- ⚠️ CI/deploy ainda não rodaram num GitHub real (sem remote); gates locais 100% verdes
  (lint/typecheck/format/test/test:coverage + `cd web && next build`).

### Onda 12 — SaaS multi-tenant (schema) ✅ migration aplicada ao vivo (2026-06-24)
- **Spec aprovada** `docs/specs/SPEC-saas-multitenant.md` (status Approved-design; 4 decisões de §5
  validadas pelo operador). Migration `supabase/migrations/20260624120000_saas_multitenant.sql`
  **aplicada via MCP no banco vivo `yjmngxsdfsxtzjastvwi`** (`apply_migration` success).
- **3 tabelas novas:** `accounts` (tenant pagante: `role` super_admin/socio/cliente_usuario, `plan`,
  `subscription_status`, ganchos billing/auth), `ad_account_connections` (1/conta Meta; `connection_method`
  enum `manual_token`|`oauth_meta`; token cifrado `access_token_cipher bytea` + `last4` + `status`/
  `last_validated_at`), `api_keys_clientes` (chave de provedor por account, cifrada, `unique(account_id,provider)`).
- **Alterações:** `clients` ganhou `account_id` NOT NULL (FK cascade); slug deixou de ser único global →
  `unique(account_id, slug)` (`clients_slug_key` dropada, `clients_account_slug_uniq` criada);
  `ad_account_id` segue único global (anti-hijack). `agent_jobs` ganhou `account_id` (nullable, conveniência).
- **7 enums novos** (`account_role`/`account_plan`/`subscription_status`/`connection_method`/
  `connection_status`/`api_key_provider`/`api_key_status`). `oauth_meta` no enum **SEM código** (decisão
  consciente: precisa Business Verification + App Review = fase 2). RLS deny-by-default nas 3 novas.
- **Backfill verificado:** account-âncora `acme` (super_admin) criada; `clients` órfãos=0 (1/1),
  `agent_jobs` sem account=0 (7/7). Advisor de segurança: só `rls_enabled_no_policy` INFO (esperado pelo
  design deny-by-default), zero WARN/ERROR.
- **Decisões validadas:** isolamento = Opção A (escopo na app `withAccount()`, RLS real como fast-follow);
  fallback de chave = `super_admin` usa global, demais exigem chave própria (senão job aborta); cripto =
  AES-256-GCM app-level com **chaves separadas** (`AD_TOKEN_ENC_KEY`/`API_KEY_ENC_KEY`); validação de token
  1×/dia + sob falha. **Mudança arquitetural a implementar depois:** runner passa a chamar Meta com token
  do tenant (REST), não só o MCP-connector compartilhado (ADR 0028).
- **Docs estruturais ✅:** ADR 0026 (multi-tenancy/isolamento), 0027 (segredos cifrados +
  `resolveProviderKey`), 0028 (Meta por token manual; OAuth = fase 2) + threat model STRIDE
  `docs/security/threats/saas-multitenant.md`.
- **Núcleo puro ✅ (commit nesta sessão):** `scripts/onda12/domain/` — `crypto.ts` (AES-256-GCM:
  `parseKey`/`encryptSecret`/`decryptSecret` fail-closed/`last4`/bytea `\x` boundary) e `provider-key.ts`
  (`resolveProviderKey`: tenant nunca cai na global; fora do super_admin chave própria obrigatória).
  **19 testes** (248 no total). Gates verdes: lint/typecheck/test/format.
- **Etapa 3 ✅ (commit nesta sessão):** infra + validação + injeção de chaves no runner.
  - **Puros (testados):** `connection-health.ts` (`classifyMetaProbe`: ok/auth_error/transient — erro
    transitório NÃO condena o token), `application/validate-plan.ts` (`planConnectionPatch`),
    `application/tenant-key-env.ts` (`planTenantKeyEnv`). +15 testes (263 total).
  - **Infra:** `infrastructure/secrets-rest.ts` (lê/patcha conexões/chaves via REST, `readEncKeys`
    AD_TOKEN/API_KEY, decifra só server-side). **Orquestrador** `validate-connections.ts` (probe Graph
    com token no header Bearer — nunca na URL/log; ADR 0028 caminho REST por tenant).
  - **Skill** `.claude/skills/validate-connections-tick/` + **cron** 08:00 UTC (TS direto, sem claude -p).
  - **Runner:** `poll-once.ts` resolve chaves do tenant antes de rodar (gated: **super_admin = no-op**,
    caminho atual OAuth/global preservado; tenant pagante sem chave própria → job aborta cedo).
    `ClaimedJob.accountId` parseado. Envs novas em `types/env.d.ts` (AD_TOKEN_ENC_KEY/API_KEY_ENC_KEY).
  - ⚠️ **Não exercitado ao vivo:** sem conexões/tenants reais nem `*_ENC_KEY` setadas; lógica de decisão
    100% testada. Para o runner aplicar, falta `fly secrets set AD_TOKEN_ENC_KEY/API_KEY_ENC_KEY` +
    redeploy (dormant até existir tenant não-super_admin). `.env.example` ainda não espelha as 2 chaves.
- **Etapa 4 ✅ (commit nesta sessão):** dashboard — fundação multi-tenant + API + página de leitura.
  - **Puros (testados):** `web/lib/multitenant/scope.ts` (`scopeEq`/`canManageAccount` — super_admin vê
    tudo, demais só a própria account; isolamento Opção A num só ponto), `secrets.ts` (AES-256-GCM
    espelhando o formato do runner; teste **decifra com o algoritmo do runner** = prova de
    compatibilidade), `requests.ts` (Zod das mutações). +14 testes (277 total).
  - **Serviços server-side:** `accounts.ts` (`getCurrentScope` = super_admin âncora), `connections.ts`,
    `api-keys.ts` — leitura projeta **só colunas de DISPLAY** (cipher NUNCA no select → nunca sai do
    servidor); escrita cifra (`enc-keys.ts` lê AD_TOKEN/API_KEY) e guarda só `last4`. Rotação de key =
    upsert por `(account, provider)`.
  - **API Hono** sob `/data/*`: GET accounts/connections/api-keys + POST connections/api-keys (cifram;
    guarda `isSecretsVaultEnabled` → 503 sem as chaves). **Página** `app/settings` (Conexões & chaves,
    só `••••last4` + status + datas) + link no nav. envs `AD_TOKEN_ENC_KEY`/`API_KEY_ENC_KEY` (opcionais)
    + flag `isSecretsVaultEnabled` em `web/lib/env.ts`.
  - Gates: lint/typecheck/test (277)/format + `cd web && npm run build` **verdes** (rota `/settings`).
  - ⚠️ **Não exercitado ao vivo** (sem `*_ENC_KEY` setadas na Vercel; leitura funciona, escrita dá 503).
- **Forms de cadastro ✅ (commit nesta sessão):** `web/components/settings/{connection-form,api-key-form}.tsx`
  (client) ligados no `/settings`. POST para `/api/data/{connections,api-keys}` → cifram server-side,
  `router.refresh()`. Desabilitam quando o cofre está off (`!isSecretsVaultEnabled`); mensagens de
  erro mapeadas (inclui `vault_unconfigured`). `web build` verde (rota `/settings` 1.87 kB).
- **Onda 12 — schema/segurança/runner/dashboard/forms prontos.** Pendências restantes (fora do escopo
  desta onda): (1) evolução do **auth** para login por account (hoje operador único = super_admin; a
  spec já separou como fase própria); (2) **go-live das envs** `AD_TOKEN_ENC_KEY`/`API_KEY_ENC_KEY`
  (`fly secrets` + Vercel) para a escrita sair do 503; (3) `.env.example` espelhar as 2 chaves (arquivo
  bloqueado por permissão nesta sessão — está em `types/env.d.ts` e `web/lib/env.ts`).

### Onda 13 — Auth por account (login multi-tenant) ✅ (commit nesta sessão)
- **Spec/ADR/threat model:** `docs/specs/SPEC-auth-por-account.md` (Approved-design), ADR
  `0029-auth-por-account`, threat model `docs/security/threats/auth-por-account.md`.
- **Migration** `20260624130000_auth_por_account.sql` **aplicada ao banco vivo via MCP**: `accounts`
  ganhou `email citext unique` + `password_hash text` + `last_login_at`. Aditiva (colunas nullable;
  sem backfill — âncora pega senha via script/bootstrap).
- **Decisões (validadas):** JWT custom estendido (sessão = `{sub:account_id, role, slug}`); email como
  login; **scrypt** (`node:crypto`, formato `scrypt$salt$hash`, sem dependência nova); `socio` =
  super_admin reduzido (vê tudo, sem ações privilegiadas).
- **Puros (testados):** `web/lib/auth/password.ts` (scrypt hash/verify fail-closed), `domain.ts`
  (claims por account, `buildClaims`/`isAuthenticated`/`hasRole`, login por email), `multitenant/scope.ts`
  (`GLOBAL_VISIBILITY={super_admin,socio}`, `scopeFromClaims`). +12 testes (289 total).
- **Infra/UI:** `session.ts` assina/verifica as novas claims; `server.ts` `requireOperator`(autenticado)
  + `requireRole`; `middleware.ts` `isAuthenticated`; `/auth/login` resolve por email→scrypt, com
  **bootstrap legado** (DASHBOARD_PASSWORD→âncora super_admin) até a âncora ter senha; API deriva scope
  das claims (`scopeFromClaims`), não mais de `getCurrentScope` fixo; login UI ganhou campo email;
  Shell mostra a conta logada (slug + papel). Script `scripts/onda13/set-account-password.ts` (seta
  email+senha scrypt de uma account por slug).
- Gates: lint/typecheck/test(289)/format + `cd web && next build` **verdes** (rotas `/login` e `/settings`).
- ⚠️ **Deploy invalida sessões antigas:** as claims mudaram de shape → cookies antigos viram sessão
  nula → operador re-loga (email qualquer + `DASHBOARD_PASSWORD` via bootstrap). Esperado. Para a âncora
  ter login por email real: rodar `set-account-password.ts acme <email> <senha>`.
- ⚠️ **Não exercitado ao vivo** (sem deploy ainda); lógica de auth/scope 100% testada.

### Go-live — produção (2026-06-22/23) 🔄 em andamento
- **Runner Fly** `imers-ometaads` (gru) **no ar 24/7**: build local (`flyctl deploy --local-only` —
  builder remoto batia em TLS x509 na rede do operador), `.dockerignore` p/ não copiar `node_modules`
  do Windows, `IS_SANDBOX=1` no `fly.toml [env]`, fila vazia (row de nulls) tratada como no-job. Claude
  autenticado via `claude login` (OAuth no volume `claude_oauth`). **Meta MCP conectado de conta** (não
  `.mcp.json`). ✅ smoke `job→runner→completed` (skill `daily-summary`).
- **Dashboard Vercel** `meta-ads-dashboard` (`topaz-theta`), plano Hobby → cron diário. Login + leitura
  real OK. Gotcha CSP-por-nonce: exige header CSP na **requisição** (middleware) **e** render **dinâmico**
  (`export const dynamic` no `app/layout.tsx`), senão `strict-dynamic` bloqueia a hidratação em prod.
- **Campanha real** `cliente-exemplo · traffic · 20260623-0111` criada pelo runner (3 ads PAUSED).
- **Fix criativo:** `image-generate` proibida de placeholder + gera via Node (commit `3720f6e`); 3
  imagens reais (`gpt-image-1`) + 3 criativos novos na Meta; runner redeployado. Ver
  [[image-generate-placeholder-gotcha]] e [[deploy-infra-go-live]].
- ❌ Falta: ciclo Meta **enfileirado** end-to-end; remote GitHub + CI/CD; Worker de tracking; domínio
  real; `.env.example` espelhar `TTS_PROVIDER`/`MINIMAX_*`; rotacionar senha `nexus-local`.
