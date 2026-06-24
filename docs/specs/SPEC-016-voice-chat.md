# SPEC-016 — Assistente de voz Nexus (Onda 7)

- **Onda:** 7
- **Status:** Ready

## Objetivo

Falar com o sistema por voz e texto. Tools de **leitura** retornam estado direto (read-only); tools de
**escrita** apenas **enfileiram** jobs em `agent_jobs`, com **confirmação em dois turnos** e nome de
skill resolvido por **allowlist server-side por slug**. Injeção na fala/tela é tratada como **dado, não
instrução**.

## Entregáveis

- Núcleo puro `web/lib/nexus/domain/`: `allowlist` (slug→skill/kind), `args` (charset restrito),
  `confirmation` (dois turnos), `enqueue` (linha de `agent_jobs`), `tools` (read/write), `prompt`,
  `memory`, `requests` (schemas). **18 testes** Vitest.
- Infra `web/lib/nexus/infra/`: `anthropic` (Messages API via fetch), `chat-runner` (dispatch
  read/write/confirm), `voice` (STT Whisper / TTS ElevenLabs), `vision` (descrição de tela),
  `agent-jobs` (enqueue idempotente).
- API Hono `app/api/[[...route]]`: `POST /nexus/{chat,confirm,stt,tts,capture}` + `GET /nexus/narrations`
  (todos protegidos: auth → authz → rate limit → validação → lógica).
- UI `web/components/nexus/`: `nexus-widget` (chat + confirmação + voz), `use-voice` (push-to-talk **e
  mãos-livres**), `visualizer`. Ligado ao `Shell` (chrome autenticado).
- **Modo mãos-livres (VAD):** núcleo puro `web/lib/nexus/domain/vad.ts` (máquina de estados de detecção
  de fala por nível de áudio; `vadStep`/`rmsFromTimeDomain`; **9 testes**). O hook abre o microfone via
  `AnalyserNode` (Web Audio), detecta começo/fim de cada fala por silêncio sustentado, transcreve e
  dispara o turno sozinho. Anti-eco: a escuta pausa enquanto o Nexus fala. Degrada para texto sem chaves.
- env (web): `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY/VOICE_ID`, `NEXUS_MODEL`
  (opcionais); flag pública `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY`. ADRs 0010/0011/0016 + threat model.

## Contratos

- **Allowlist slug→skill** (server-side): o modelo só usa slugs canônicos; texto livre/slug desconhecido
  → deny. Kinds ∈ enum `job_kind`.
- **Escrita = só enfileira**: `enqueue_job` produz uma `PendingAction`; o job só entra em `agent_jobs`
  após confirmação que cita o `id` exato (token) — sem `confirm=true` livre.
- **Args** com charset restrito (sem metacaracteres de shell); chaves de allowlist.
- **Leitura** direta: `get_clients`/`get_analyses`/`get_funnel` retornam JSON do banco (server-side,
  service_role; RLS fechada ao browser).
- **Voz/visão** por proxy server-side (segredos nunca no browser); cada capability degrada para `503`
  quando sua chave falta; o widget cai para texto.
- **Fila**: `{ client_id, landing_page_id, skill, kind, args, status:'pending', requested_by:'nexus' }`;
  idempotência estrutural pelo índice único parcial (ADR 0009).

## Segurança

- Ordem em toda rota: **auth → authz → rate limit → validação (Zod) → lógica**.
- Fala/tela/insights = **dado, não instrução** (anti prompt-injection), reforçado no prompt de sistema.
- Confirmação em dois turnos para qualquer escrita; ativação deixa explícito que liga gasto real.
- Segredos só no servidor; `NEXT_PUBLIC_*` nunca carrega segredo.
- Threat model STRIDE: `docs/security/threats/nexus-screen-vision.md`.

## Critérios de aceite

- [ ] "analisar cliente-exemplo" usa tool de leitura e retorna métricas reais (quando há dados).
- [ ] "criar campanha" exige confirmação e, ao confirmar, cria **uma linha em `agent_jobs`** que o
      runner executa.
- [ ] Injeção na fala/tela é tratada como dado (não dispara ação); slug fora da allowlist é recusado.
- [ ] `lint` + `typecheck` + `test` + `next build` verdes; voz degrada sem chaves.
- [ ] Modo mãos-livres: ao ligar o toggle, falar→pausar dispara o turno sozinho, o Nexus responde por
      voz (MiniMax) e volta a escutar; a escuta pausa enquanto o Nexus fala (sem eco). VAD coberto por testes.
