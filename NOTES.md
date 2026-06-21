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
| **Onda atual** | Ondas 0,1 ✅ + **2, 6, 8 ✅** + **3 ✅** (runner Fly) + **4 ✅** (analytics) + **5 ✅** (ativação + vendas) + **7 ✅** (Nexus voz/chat). **Próxima: Onda 9 (editor LP + autônomo).** ⚠️ Falta validar `supabase db reset` ao vivo; runner/skills/dashboard/Nexus não exercitados ao vivo (credenciais vazias; sem `docker build`/deploy Fly). |
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
- ⚠️ **PENDENTE:** `supabase db reset` não rodou (sem Supabase CLI/psql; Docker daemon parado).
  - **Validador pronto sem credenciais:** suba o Docker Desktop e eu rodo um Postgres 16 efêmero +
    `scripts/_validate_shim.sql` (cria roles `service_role`/`anon`/`authenticated` + schema `storage`)
    e aplico todas as migrations + seed + checks de aceite. Alternativa: instalar Supabase CLI e preencher `SUPABASE_*`.
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
### Onda 8 — Landing pages ✅ (parcial: pacote+template) (commit `8a8c2ba`)
- `packages/lp-render` (`@template/lp-render`): ContentDoc/Theme/Settings (Zod), **17 seções**,
  serializer puro/determinístico → `content-spec.json`+`messages/pt.json`+`theme.css` (golden tests) +
  CLI `tsx`, libs (checkout/utm/consent/affiliate).
- `landing-pages/_template`: Next.js `output:export`, 17 renderizadores, consome `generated/`,
  `next build` verde (out/ estático). ADRs 0012/0013/0015/0017 + SPEC-011.
- ⏳ Resta (continuação da Onda 8): skills `create/publish-landing-page-<cliente>` (runner/Cloudflare).
### Onda 9 — Editor LP + modo autônomo ⏳
### Onda 10 — Tracking (Worker) ⏳
### Onda 11 — Hardening + CI/CD ⏳
