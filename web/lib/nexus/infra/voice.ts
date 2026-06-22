import 'server-only';
import { serverEnv, type ServerEnv } from '../../env';
import { NexusUnavailableError } from './anthropic';
import {
  buildMinimaxBody,
  clampPitch,
  clampSpeed,
  clampVol,
  hexToBytes,
  parseMinimaxResponse,
  resolveMinimaxVoice,
  resolveTtsProvider,
} from '../domain/tts';

/**
 * Pipeline de voz do Nexus (server-side proxy). STT via OpenAI Whisper; TTS plugável por provedor
 * (TTS_PROVIDER: 'elevenlabs' | 'minimax', default elevenlabs — ADR 0011). As chaves nunca vão ao
 * browser. Cada capability degrada com NexusUnavailableError quando sua chave falta. O contrato de
 * `synthesize` (devolve bytes audio/mpeg) é o mesmo para os dois provedores, então a rota e o
 * cliente não mudam ao trocar.
 */

/** Transcreve áudio (Whisper). Recebe o arquivo do upload e devolve o texto. */
export async function transcribe(audio: Blob, filename = 'audio.webm'): Promise<string> {
  const env = serverEnv();
  if (!env.OPENAI_API_KEY)
    throw new NexusUnavailableError('OPENAI_API_KEY ausente — STT indisponível');
  const form = new FormData();
  form.append('file', audio, filename);
  form.append('model', 'whisper-1');
  form.append('language', 'pt');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Whisper ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  return json.text ?? '';
}

/** Opções de síntese (usadas pelo MiniMax; o ElevenLabs usa só o texto + voz da env). */
export interface TtsOptions {
  voice?: string | undefined;
  speed?: number | undefined;
  pitch?: number | undefined;
  vol?: number | undefined;
}

/** Sintetiza fala. Despacha pelo provedor configurado; devolve bytes de áudio (audio/mpeg). */
export async function synthesize(text: string, opts: TtsOptions = {}): Promise<ArrayBuffer> {
  const env = serverEnv();
  if (resolveTtsProvider(env.TTS_PROVIDER) === 'minimax') {
    return synthesizeMinimax(env, text, opts);
  }
  return synthesizeElevenLabs(env, text);
}

/** TTS via ElevenLabs (eleven_multilingual_v2). Devolve audio/mpeg cru. */
async function synthesizeElevenLabs(env: ServerEnv, text: string): Promise<ArrayBuffer> {
  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
    throw new NexusUnavailableError('ELEVENLABS_* ausente — TTS indisponível');
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}

/**
 * TTS via MiniMax t2a_v2 (speech-02-turbo, language_boost pt). A MiniMax devolve o áudio como
 * string HEX dentro de JSON (sucesso = base_resp.status_code === 0) — convertemos HEX -> MP3.
 * A chave fica só no servidor (Authorization: Bearer). Voz por allowlist (request > env > default).
 */
async function synthesizeMinimax(
  env: ServerEnv,
  text: string,
  opts: TtsOptions,
): Promise<ArrayBuffer> {
  if (!env.MINIMAX_API_KEY) {
    throw new NexusUnavailableError('MINIMAX_API_KEY ausente — TTS indisponível');
  }
  const body = buildMinimaxBody(text, {
    voice: resolveMinimaxVoice(opts.voice, env.MINIMAX_VOICE_ID),
    speed: clampSpeed(opts.speed),
    pitch: clampPitch(opts.pitch),
    vol: clampVol(opts.vol),
  });
  const res = await fetch('https://api.minimax.io/v1/t2a_v2', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.MINIMAX_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`MiniMax ${res.status}`);
  }
  const parsed = parseMinimaxResponse(json);
  if (!parsed.ok) {
    throw new Error(`MiniMax TTS: ${parsed.error}`);
  }
  return hexToBytes(parsed.hex).buffer as ArrayBuffer;
}
