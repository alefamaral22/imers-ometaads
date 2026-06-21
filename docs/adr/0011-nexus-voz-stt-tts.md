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
