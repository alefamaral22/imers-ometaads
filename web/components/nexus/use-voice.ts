'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Hook de voz do Nexus (client). Push-to-talk: grava o microfone (MediaRecorder), envia para o STT
 * server-side e devolve o texto; também toca a resposta sintetizada (TTS). Tudo degrada em silêncio
 * quando o navegador não suporta ou a capability está indisponível no servidor (503).
 */
export interface UseVoice {
  supported: boolean;
  recording: boolean;
  busy: boolean;
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  speak: (text: string, voice?: string) => Promise<void>;
}

export function useVoice(): UseVoice {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

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

    setBusy(true);
    try {
      const form = new FormData();
      form.append('audio', blob, 'audio.webm');
      const res = await fetch('/api/nexus/stt', { method: 'POST', body: form });
      if (!res.ok) return null;
      const json = (await res.json()) as { text?: string };
      return json.text ?? null;
    } finally {
      setBusy(false);
    }
  }, []);

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
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play().catch(() => undefined);
    } catch {
      // silencioso: voz é um plus, o texto já foi mostrado
    }
  }, []);

  return { supported, recording, busy, startRecording, stopAndTranscribe, speak };
}
