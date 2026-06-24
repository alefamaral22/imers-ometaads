/**
 * VAD (Voice Activity Detection) — máquina de estados PURA para o modo mãos-livres do Nexus
 * (SPEC-016 / ADR 0011). Recebe amostras de nível de áudio (RMS normalizado 0..1) com timestamp e
 * decide quando uma fala COMEÇOU e quando uma utterance TERMINOU (silêncio sustentado) — sem que o
 * operador precise apertar nada. Sem I/O: a captura (AnalyserNode/MediaRecorder) fica no hook
 * `use-voice`; aqui só a decisão, determinística e testável. Nível de áudio é dado, não instrução.
 */

export interface VadConfig {
  /** Nível a partir do qual a amostra conta como voz (RMS normalizado). */
  speechThreshold: number;
  /** Fala mínima acumulada para a utterance valer (descarta estalos/ruído curto). Ms. */
  minSpeechMs: number;
  /** Silêncio contínuo APÓS fala que encerra a utterance. Ms. */
  silenceHangoverMs: number;
  /** Teto duro de uma utterance (segurança contra mic preso aberto). Ms. */
  maxUtteranceMs: number;
}

/**
 * Defaults calibrados para fala PT em ambiente de escritório. `speechThreshold` é RMS normalizado
 * (silêncio típico < 0.01; voz 0.03–0.2). Ajustável sem tocar na máquina de estados.
 */
export const DEFAULT_VAD_CONFIG: VadConfig = {
  speechThreshold: 0.025,
  minSpeechMs: 250,
  silenceHangoverMs: 900,
  maxUtteranceMs: 15000,
};

export type VadPhase = 'idle' | 'speaking' | 'trailing';

export interface VadState {
  phase: VadPhase;
  /** tMs em que a fala da utterance atual começou. */
  speechStartedMs: number | null;
  /** tMs da última amostra acima do limiar (para medir o silêncio à direita). */
  lastVoiceMs: number | null;
  /** Soma das durações de amostras com voz (aproxima a fala real). */
  voiceMs: number;
  /** tMs da última amostra processada (para o delta entre amostras). */
  lastSampleMs: number | null;
}

export type VadEvent = 'speech-start' | 'utterance-end';

export interface VadStep {
  state: VadState;
  /** Evento emitido nesta amostra, se houver. */
  event?: VadEvent;
}

export interface VadSample {
  /** Nível RMS normalizado (0..1). */
  level: number;
  /** Timestamp monotônico em milissegundos. */
  tMs: number;
}

export function initVadState(): VadState {
  return {
    phase: 'idle',
    speechStartedMs: null,
    lastVoiceMs: null,
    voiceMs: 0,
    lastSampleMs: null,
  };
}

// Delta máximo entre amostras: protege a contagem de fala contra gaps (aba em background, GC).
const MAX_SAMPLE_DELTA_MS = 250;

/**
 * Avança a máquina de uma amostra. Determinística: mesma (state, sample, cfg) → mesmo resultado.
 * - `idle` + voz  → começa a utterance, emite `speech-start`.
 * - ativa + silêncio sustentado (≥ hangover) OU teto atingido → emite `utterance-end` se houve fala
 *   suficiente; senão descarta em silêncio (era ruído).
 */
export function vadStep(state: VadState, sample: VadSample, cfg: VadConfig): VadStep {
  const { level, tMs } = sample;
  const isVoice = level >= cfg.speechThreshold;
  const dt =
    state.lastSampleMs === null
      ? 0
      : Math.max(0, Math.min(tMs - state.lastSampleMs, MAX_SAMPLE_DELTA_MS));

  if (state.phase === 'idle') {
    if (isVoice) {
      return {
        state: {
          phase: 'speaking',
          speechStartedMs: tMs,
          lastVoiceMs: tMs,
          voiceMs: 0,
          lastSampleMs: tMs,
        },
        event: 'speech-start',
      };
    }
    return { state: { ...state, lastSampleMs: tMs } };
  }

  // Utterance em andamento (speaking | trailing).
  const voiceMs = state.voiceMs + (isVoice ? dt : 0);
  const lastVoiceMs = isVoice ? tMs : state.lastVoiceMs;
  const startedMs = state.speechStartedMs ?? tMs;
  const phase: VadPhase = isVoice ? 'speaking' : 'trailing';

  const trailingSilenceMs = tMs - (lastVoiceMs ?? tMs);
  const utteranceMs = tMs - startedMs;
  const hadEnoughSpeech = voiceMs >= cfg.minSpeechMs;
  const endedBySilence = !isVoice && trailingSilenceMs >= cfg.silenceHangoverMs;
  const endedByMax = utteranceMs >= cfg.maxUtteranceMs;

  if (endedByMax || endedBySilence) {
    const reset = initVadState();
    reset.lastSampleMs = tMs;
    // Só emite se a utterance teve fala suficiente; ruído curto é descartado sem virar turno.
    return hadEnoughSpeech ? { state: reset, event: 'utterance-end' } : { state: reset };
  }

  return {
    state: { phase, speechStartedMs: startedMs, lastVoiceMs, voiceMs, lastSampleMs: tMs },
  };
}

/**
 * RMS normalizado (0..1) de um bloco de amostras no domínio do tempo do AnalyserNode (bytes 0..255,
 * centrados em 128). Puro para ser testável; o hook só passa o Uint8Array da Web Audio API.
 */
export function rmsFromTimeDomain(bytes: Uint8Array | number[]): number {
  const n = bytes.length;
  if (n === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = ((bytes[i] ?? 128) - 128) / 128;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / n);
}
