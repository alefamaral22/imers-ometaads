'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_VAD_CONFIG,
  initVadState,
  rmsFromTimeDomain,
  vadStep,
  type VadState,
} from '../../lib/nexus/domain/vad';

/**
 * Hook de voz do Nexus (client). Dois modos:
 *  - **Push-to-talk** (`startRecording`/`stopAndTranscribe`): grava, transcreve, devolve o texto.
 *  - **Mãos-livres** (`startHandsFree`/`stopHandsFree`): escuta contínua com VAD (detecção de fala)
 *    — detecta começo/fim de cada fala por silêncio e dispara `onUtterance` sozinho, sem apertar nada.
 * O TTS (`speak`) toca a resposta e resolve só quando o áudio TERMINA, e auto-pausa a escuta enquanto
 * o Nexus fala (anti-eco). Tudo degrada em silêncio quando o navegador não suporta ou a capability
 * está indisponível no servidor (503). A captura usa a Web Audio API; a decisão é pura (`domain/vad`).
 */
export interface UseVoice {
  supported: boolean;
  recording: boolean;
  busy: boolean;
  /** Escuta contínua ligada. */
  handsFree: boolean;
  /** Capturando fala neste instante (mic aberto e ouvindo, fora de pausa). */
  listening: boolean;
  /** Nexus falando agora (TTS tocando). */
  speaking: boolean;
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  /** Liga o modo mãos-livres; chama `onUtterance(audioBlob)` ao fim de cada fala detectada. */
  startHandsFree: (onUtterance: (audio: Blob) => void | Promise<void>) => Promise<void>;
  stopHandsFree: () => void;
  /** Pausa/retoma a escuta (ex.: enquanto o turno está sendo processado no servidor). */
  setHandsFreePaused: (paused: boolean) => void;
  /** Transcreve um blob de áudio já capturado (usado pelos dois modos). */
  transcribeBlob: (blob: Blob) => Promise<string | null>;
  speak: (text: string, voice?: string) => Promise<void>;
}

const SAMPLE_INTERVAL_MS = 50;

export function useVoice(): UseVoice {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Push-to-talk
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Mãos-livres
  const hfStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vadStateRef = useRef<VadState>(initVadState());
  const hfRecorderRef = useRef<MediaRecorder | null>(null);
  const hfChunksRef = useRef<Blob[]>([]);
  const onUtteranceRef = useRef<((audio: Blob) => void | Promise<void>) | null>(null);
  const enabledRef = useRef(false);
  const pausedRef = useRef(false);
  const speakingRef = useRef(false);

  const supported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

  // ── STT compartilhado ───────────────────────────────────────────────────────
  const transcribeBlob = useCallback(async (blob: Blob): Promise<string | null> => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('audio', blob, 'audio.webm');
      const res = await fetch('/api/nexus/stt', { method: 'POST', body: form });
      if (!res.ok) return null; // STT indisponível (503) → degrada para texto
      const json = (await res.json()) as { text?: string };
      return json.text ?? null;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  // ── Push-to-talk ──────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!supported || recorderRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }, [supported]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    streamRef.current = null;
    setRecording(false);
    return transcribeBlob(blob);
  }, [transcribeBlob]);

  // ── Mãos-livres (escuta contínua com VAD) ──────────────────────────────────────
  const startSegment = useCallback(() => {
    const stream = hfStreamRef.current;
    if (!stream || hfRecorderRef.current) return;
    hfChunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) hfChunksRef.current.push(e.data);
    };
    recorder.start();
    hfRecorderRef.current = recorder;
  }, []);

  /** Para o segmento atual; resolve com o blob (ou null se for descartado). */
  const stopSegment = useCallback(async (discard: boolean): Promise<Blob | null> => {
    const recorder = hfRecorderRef.current;
    if (!recorder) return null;
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(hfChunksRef.current, { type: 'audio/webm' }));
      recorder.stop();
    });
    hfRecorderRef.current = null;
    hfChunksRef.current = [];
    return discard ? null : blob;
  }, []);

  const tick = useCallback(() => {
    if (!enabledRef.current) return;
    const analyser = analyserRef.current;
    const buf = timeBufRef.current;
    if (!analyser || !buf) return;

    // Anti-eco: enquanto o Nexus fala (ou o turno está em processamento), não escuta nem grava.
    if (pausedRef.current || speakingRef.current) {
      if (hfRecorderRef.current) void stopSegment(true);
      vadStateRef.current = initVadState();
      setListening(false);
      return;
    }
    setListening(true);

    analyser.getByteTimeDomainData(buf);
    const level = rmsFromTimeDomain(buf);
    const { state, event } = vadStep(
      vadStateRef.current,
      { level, tMs: performance.now() },
      DEFAULT_VAD_CONFIG,
    );
    vadStateRef.current = state;

    if (event === 'speech-start') {
      startSegment();
    } else if (event === 'utterance-end') {
      void stopSegment(false).then((blob) => {
        if (blob && blob.size > 0) void onUtteranceRef.current?.(blob);
      });
    }
  }, [startSegment, stopSegment]);

  const startHandsFree = useCallback(
    async (onUtterance: (audio: Blob) => void | Promise<void>) => {
      if (!supported || enabledRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      hfStreamRef.current = stream;
      const Ctx: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume().catch(() => undefined);
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      timeBufRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      vadStateRef.current = initVadState();
      onUtteranceRef.current = onUtterance;
      enabledRef.current = true;
      pausedRef.current = false;
      setHandsFree(true);
      intervalRef.current = setInterval(tick, SAMPLE_INTERVAL_MS);
    },
    [supported, tick],
  );

  const stopHandsFree = useCallback(() => {
    enabledRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    if (hfRecorderRef.current) {
      try {
        hfRecorderRef.current.stop();
      } catch {
        /* já parado */
      }
      hfRecorderRef.current = null;
    }
    hfStreamRef.current?.getTracks().forEach((t) => t.stop());
    hfStreamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    onUtteranceRef.current = null;
    vadStateRef.current = initVadState();
    setHandsFree(false);
    setListening(false);
  }, []);

  const setHandsFreePaused = useCallback((paused: boolean) => {
    pausedRef.current = paused;
  }, []);

  // ── TTS ─────────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string, voice?: string) => {
    try {
      const res = await fetch('/api/nexus/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(voice ? { text, voice } : { text }),
      });
      if (!res.ok) return; // TTS indisponível → degrada para texto
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
      const audio = new Audio(url);
      speakingRef.current = true;
      setSpeaking(true);
      // Resolve só quando o áudio TERMINA (necessário para o loop de mãos-livres retomar a escuta).
      await new Promise<void>((resolve) => {
        const done = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.play().catch(done);
      });
    } catch {
      // silencioso: voz é um plus, o texto já foi mostrado
    } finally {
      speakingRef.current = false;
      setSpeaking(false);
    }
  }, []);

  // Limpeza ao desmontar (evita mic/AudioContext vazando).
  useEffect(() => () => stopHandsFree(), [stopHandsFree]);

  return {
    supported,
    recording,
    busy,
    handsFree,
    listening,
    speaking,
    startRecording,
    stopAndTranscribe,
    startHandsFree,
    stopHandsFree,
    setHandsFreePaused,
    transcribeBlob,
    speak,
  };
}
