# ADR 0011 — Pipeline de voz do Nexus (STT/TTS) por proxy server-side, com degradação

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 7

## Contexto

O Nexus fala e ouve. STT (Whisper/OpenAI) e TTS (ElevenLabs) exigem segredos que **não podem ir ao
browser**. Além disso, em dev/preview essas chaves podem não estar configuradas — o dashboard precisa
continuar buildando e funcionando (chat por texto) mesmo sem voz.

## Decisão

O pipeline de voz é **proxy server-side**: o browser grava o microfone (push-to-talk com
`MediaRecorder`) e envia o áudio para `POST /api/nexus/stt`, que chama o Whisper com a `OPENAI_API_KEY`
do servidor e devolve o texto. O TTS é simétrico: `POST /api/nexus/tts` chama o ElevenLabs com a
`ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID` e devolve `audio/mpeg`. As chaves **nunca** vão ao browser.

Cada capability **degrada** quando sua chave falta: a função lança `NexusUnavailableError`, o endpoint
responde `503` e o widget cai para texto (sem quebrar). As flags `isSttEnabled`/`isTtsEnabled`/
`isNexusChatEnabled` (env) tornam isso explícito e testável. Wake-word (Picovoice) fica como push-to-talk
nesta onda (sem dependência externa nova); a `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` já está prevista para um
drop-in futuro sem mudar a arquitetura.

## Consequências

- **Positivas:** segredos só no servidor; build e chat funcionam sem nenhuma chave de voz; trocar de
  provedor é trocar um módulo de infra; rate limit (`limitNexus`) protege os endpoints.
- **Negativas / trade-offs:** latência extra (browser→servidor→provedor); push-to-talk em vez de wake
  word always-on nesta onda.
- **Riscos & mitigação:** upload de áudio grande → endpoint protegido por auth + rate limit; provedor
  fora do ar → erro tratado, degrada para texto.

## Alternativas consideradas

- **Chamar OpenAI/ElevenLabs direto do browser** — rejeitado: exporia segredos no cliente
  (`NEXT_PUBLIC_*` nunca carrega segredo — SPEC §7/§11).
- **Exigir as chaves para o build** — rejeitado: quebraria dev/preview; a degradação graciosa é melhor.

## Atualização — TTS plugável (ElevenLabs | MiniMax)

O TTS ganhou um segundo provedor sem mudar a arquitetura nem o contrato. `TTS_PROVIDER`
(`minimax` **default** | `elevenlabs`) escolhe a preferência; **trocar = mudar a env**. A escolha é
**ciente de credencial** (`pickTtsProvider`): usa o preferido quando a chave dele existe, senão cai
para o outro provedor disponível ("em segundo caso"), senão mantém o preferido (degrada para `503`).
`synthesize(text, opts)` despacha internamente e devolve sempre `audio/mpeg`, então a rota
`/api/nexus/tts` e o cliente não mudam. A chave continua **só no servidor** (`Authorization: Bearer`
no caso da MiniMax). **Decisão do operador:** MiniMax é o padrão; ElevenLabs é o fallback.

A lógica do MiniMax fica **pura e testada** em `lib/nexus/domain/tts.ts`: montagem do corpo do
`t2a_v2` (`speech-02-turbo`, `language_boost: 'pt'`, ranges speed/pitch/vol), validação da resposta
(`base_resp.status_code === 0`) e decodificação do áudio (a MiniMax devolve **HEX** → MP3). A voz é
resolvida por **allowlist deny-by-default** (request > `MINIMAX_VOICE_ID` > `Portuguese_Solemn_Narrator_v1`);
o widget tem um seletor das vozes PT. `isTtsEnabled` passou a considerar o provedor ativo.

## Atualização — Modo mãos-livres (escuta contínua com VAD)

O push-to-talk ganhou um modo **mãos-livres**: um toggle abre o microfone e o Nexus passa a conversar
em tempo real — o operador fala quando quiser, o assistente responde por voz e **volta a escutar
sozinho**, sem apertar nada entre as falas. A detecção de começo/fim de cada fala é por **VAD** (Voice
Activity Detection) baseado no nível de áudio (RMS via `AnalyserNode` da Web Audio API): silêncio
sustentado após fala suficiente encerra a utterance, que é então transcrita (mesmo endpoint
`/api/nexus/stt`) e vira um turno.

A **decisão é pura e testada** em `lib/nexus/domain/vad.ts` (máquina de estados `idle→speaking→trailing`,
`vadStep`/`rmsFromTimeDomain`, descarta ruído curto, teto duro por utterance); a captura
(`AnalyserNode`/`MediaRecorder`) fica no hook `use-voice`. **Anti-eco:** a escuta auto-pausa enquanto o
Nexus fala (`speak` resolve só quando o áudio termina) e durante o processamento do turno, evitando que
o assistente transcreva a própria voz. Tudo continua **degradando para texto** quando STT/TTS faltam
(503) e respeitando o contrato de segurança (fala = dado, não instrução; escrita só enfileira com
confirmação em dois turnos). Wake-word (Picovoice) segue como drop-in futuro por cima deste modo.
