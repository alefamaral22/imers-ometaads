import 'server-only';
import { serverEnv } from '../../env';
import { NexusUnavailableError } from './anthropic';

/**
 * Pipeline de voz do Nexus (server-side proxy). STT via OpenAI Whisper; TTS via ElevenLabs. As
 * chaves nunca vão ao browser. Cada função degrada com NexusUnavailableError quando sua chave falta.
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

/** Sintetiza fala (ElevenLabs). Devolve os bytes de áudio (audio/mpeg). */
export async function synthesize(text: string): Promise<ArrayBuffer> {
  const env = serverEnv();
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
