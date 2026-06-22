/**
 * TTS — provedor plugável (ElevenLabs | MiniMax) + helpers PUROS do MiniMax (SPEC-016 / ADR 0011).
 * A escolha é por env TTS_PROVIDER (default 'elevenlabs'); trocar = mudar a env. A chave NUNCA vai
 * ao browser — o TTS passa pela rota protegida /api/nexus/tts. Texto/voz são dado, não instrução.
 * Sem I/O: a chamada HTTP fica na infra (voice.ts); aqui só validação/montagem testável.
 */

export const TTS_PROVIDERS = ['elevenlabs', 'minimax'] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

const TTS_PROVIDER_SET = new Set<string>(TTS_PROVIDERS);

/** Resolve o provedor a partir da env. Ausente/inválido => 'elevenlabs' (default seguro). */
export function resolveTtsProvider(raw: string | undefined): TtsProvider {
  return raw !== undefined && TTS_PROVIDER_SET.has(raw) ? (raw as TtsProvider) : 'elevenlabs';
}

// Vozes PT da MiniMax (allowlist deny-by-default). `label` é só para a UI.
export interface MinimaxVoice {
  id: string;
  label: string;
}

export const DEFAULT_MINIMAX_VOICE = 'Portuguese_Solemn_Narrator_v1';

export const MINIMAX_PT_VOICES: readonly MinimaxVoice[] = [
  { id: 'Portuguese_Solemn_Narrator_v1', label: 'Narrador Solene (padrão)' },
  { id: 'Portuguese_Deep-VoicedGentleman', label: 'Cavalheiro Grave' },
  { id: 'Portuguese_Godfather', label: 'Padrinho' },
  { id: 'Portuguese_Narrator', label: 'Narrador' },
  { id: 'Portuguese_PassionateWarrior', label: 'Guerreiro Apaixonado' },
  { id: 'Portuguese_ThoughtfulMan', label: 'Homem Reflexivo' },
  { id: 'Portuguese_Steadymentor', label: 'Mentor Firme' },
  { id: 'Portuguese_ReservedYoungMan', label: 'Jovem Reservado' },
  { id: 'Portuguese_Strong-WilledBoy', label: 'Garoto Determinado' },
  { id: 'Portuguese_Debator', label: 'Debatedor' },
  { id: 'Portuguese_RationalMan', label: 'Homem Racional' },
  { id: 'Portuguese_WiseScholar', label: 'Sábio Estudioso' },
  { id: 'Portuguese_PowerfulVeteran', label: 'Veterano Poderoso' },
  { id: 'Portuguese_PowerfulSoldier', label: 'Soldado Poderoso' },
  { id: 'Portuguese_Dramatist', label: 'Dramaturgo' },
  { id: 'Portuguese_Comedian', label: 'Comediante' },
  { id: 'Portuguese_FriendlyNeighbor', label: 'Vizinho Amigável' },
  { id: 'Portuguese_CalmLeader', label: 'Líder Calmo' },
  { id: 'Portuguese_SentimentalLady', label: 'Dama Sentimental' },
  { id: 'Portuguese_ConfidentWoman', label: 'Mulher Confiante' },
  { id: 'Portuguese_WiseLady', label: 'Mulher Sábia' },
];

const MINIMAX_VOICE_IDS = new Set<string>(MINIMAX_PT_VOICES.map((v) => v.id));

/** Allowlist deny-by-default: requisitada > fallback (env) > default. Inválida => próxima. */
export function resolveMinimaxVoice(
  requested: string | undefined,
  fallback: string | undefined,
): string {
  if (requested !== undefined && MINIMAX_VOICE_IDS.has(requested)) return requested;
  if (fallback !== undefined && MINIMAX_VOICE_IDS.has(fallback)) return fallback;
  return DEFAULT_MINIMAX_VOICE;
}

// Ranges válidos da MiniMax (do prompt de produção): speed 0.5–2.0, pitch -12..12 (int), vol 0.1–10.
export function clampSpeed(v: number | undefined): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1.1;
  return Math.min(2, Math.max(0.5, n));
}
export function clampPitch(v: number | undefined): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
  return Math.min(12, Math.max(-12, n));
}
export function clampVol(v: number | undefined): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.min(10, Math.max(0.1, n));
}

export interface MinimaxBodyOptions {
  voice: string;
  speed: number;
  pitch: number;
  vol: number;
}

/** Monta o corpo EXATO do t2a_v2 (parâmetros validados em produção — não alterar). */
export function buildMinimaxBody(text: string, opts: MinimaxBodyOptions): Record<string, unknown> {
  return {
    model: 'speech-02-turbo',
    text: text.slice(0, 5000),
    stream: false,
    voice_setting: { voice_id: opts.voice, speed: opts.speed, vol: opts.vol, pitch: opts.pitch },
    audio_setting: { sample_rate: 24000, bitrate: 128000, format: 'mp3', channel: 1 },
    language_boost: 'pt',
  };
}

export type MinimaxParse = { ok: true; hex: string } | { ok: false; error: string };

/** Valida a resposta da MiniMax: sucesso quando base_resp.status_code === 0 e há data.audio (hex). */
export function parseMinimaxResponse(json: unknown): MinimaxParse {
  if (typeof json !== 'object' || json === null) return { ok: false, error: 'resposta inválida' };
  const obj = json as {
    base_resp?: { status_code?: number; status_msg?: string };
    data?: { audio?: unknown };
  };
  const status = obj.base_resp?.status_code;
  if (status !== 0) {
    return {
      ok: false,
      error: obj.base_resp?.status_msg ?? `MiniMax status ${status ?? 'desconhecido'}`,
    };
  }
  const hex = obj.data?.audio;
  if (typeof hex !== 'string' || hex.length === 0) {
    return { ok: false, error: 'sem áudio na resposta MiniMax' };
  }
  return { ok: true, hex };
}

/** Decodifica a string HEX da MiniMax em bytes (MP3). Lança em hex inválido. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) {
    throw new Error('hex inválido');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
