'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoice } from './use-voice';
import { DEFAULT_MINIMAX_VOICE } from '../../lib/nexus/domain/tts';

export interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
}

export interface PendingAction {
  id: string;
  slug: string;
  summary: string;
  args: Record<string, string>;
}

interface SnapshotTrigger {
  status: string;
  jobId: string | null;
}

interface ChatResponse {
  reply: string;
  pending?: PendingAction;
  job?: { status: string; jobId: string | null };
  snapshot?: SnapshotTrigger;
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Polling do raio-x ao vivo (Onda 16): o job read-only termina em segundos; checamos com folga.
const SNAPSHOT_POLL_INTERVAL_MS = 1500;
const SNAPSHOT_POLL_MAX_ATTEMPTS = 14; // ~21s de janela antes de degradar com aviso amigável.

/**
 * Cérebro do Nexus (client), extraído do widget para ser compartilhado pelo widget de canto e pelo
 * console "Operação ao vivo". Chat por texto e voz, dois modos (push-to-talk e mãos-livres), tools de
 * escrita com confirmação em dois turnos, e narração do raio-x ao vivo. Sem JSX: só estado + ações.
 */
export function useNexusChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [ttsVoice, setTtsVoice] = useState(DEFAULT_MINIMAX_VOICE);
  const voice = useVoice();

  const push = useCallback((m: ChatMsg) => setMessages((prev) => [...prev, m]), []);

  const postChat = useCallback(
    async (message: string, history: HistoryTurn[]): Promise<ChatResponse | null> => {
      try {
        const res = await fetch('/api/nexus/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message, history }),
        });
        if (!res.ok) return null;
        return (await res.json()) as ChatResponse;
      } catch {
        return null;
      }
    },
    [],
  );

  const pollAndNarrate = useCallback(
    async (jobId: string | null, history: HistoryTurn[]): Promise<void> => {
      for (let attempt = 0; attempt < SNAPSHOT_POLL_MAX_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, SNAPSHOT_POLL_INTERVAL_MS));
        let ready = false;
        try {
          const q = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';
          const res = await fetch(`/api/nexus/snapshot${q}`);
          if (res.ok) ready = ((await res.json()) as { status?: string }).status === 'ready';
        } catch {
          /* tenta de novo no próximo tick */
        }
        if (ready) {
          const data = await postChat(
            'O raio-x ao vivo das campanhas ficou pronto. Leia o snapshot e me dê o resumo: a melhor, a pior e uma recomendação com número.',
            history,
          );
          const reply = data?.reply ?? 'Puxei os números, mas não consegui resumir agora.';
          push({ role: 'assistant', text: reply });
          await voice.speak(reply, ttsVoice);
          return;
        }
      }
      const msg = 'Os números demoraram a chegar. Tenta de novo em instantes.';
      push({ role: 'assistant', text: msg });
      await voice.speak(msg, ttsVoice);
    },
    [postChat, push, voice, ttsVoice],
  );

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || loading) return;
      push({ role: 'user', text: trimmed });
      setInput('');
      setLoading(true);
      let reply: string | null = null;
      let snapshot: SnapshotTrigger | null = null;
      try {
        const history = messages.map((m) => ({ role: m.role, content: m.text }));
        const res = await fetch('/api/nexus/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: trimmed, history }),
        });
        if (res.status === 503) {
          push({
            role: 'assistant',
            text: 'Nexus indisponível no momento — tente de novo em instantes.',
          });
          return;
        }
        if (res.status === 429) {
          push({
            role: 'assistant',
            text: 'Muitas mensagens em pouco tempo — aguarde alguns segundos e repita.',
          });
          return;
        }
        if (!res.ok) {
          push({ role: 'assistant', text: 'Não consegui processar agora — tente de novo.' });
          return;
        }
        const data = (await res.json()) as ChatResponse;
        push({ role: 'assistant', text: data.reply });
        setPending(data.pending ?? null);
        reply = data.reply;
        snapshot = data.snapshot ?? null;
      } finally {
        setLoading(false);
      }
      if (reply) await voice.speak(reply, ttsVoice);
      if (snapshot) {
        const history: HistoryTurn[] = [
          ...messages.map((m) => ({ role: m.role, content: m.text })),
          { role: 'user', content: trimmed },
          { role: 'assistant', content: reply ?? '' },
        ];
        await pollAndNarrate(snapshot.jobId, history);
      }
    },
    [loading, messages, push, voice, ttsVoice, pollAndNarrate],
  );

  const handleUtterance = useCallback(
    async (blob: Blob): Promise<void> => {
      voice.setHandsFreePaused(true);
      try {
        const text = await voice.transcribeBlob(blob);
        if (text && text.trim()) await send(text);
      } finally {
        voice.setHandsFreePaused(false);
      }
    },
    [voice, send],
  );

  const handleUtteranceRef = useRef(handleUtterance);
  useEffect(() => {
    handleUtteranceRef.current = handleUtterance;
  }, [handleUtterance]);
  const stableOnUtterance = useCallback((blob: Blob) => handleUtteranceRef.current(blob), []);

  const toggleHandsFree = useCallback(async () => {
    if (voice.handsFree) {
      voice.stopHandsFree();
      return;
    }
    try {
      await voice.startHandsFree(stableOnUtterance);
    } catch {
      push({
        role: 'assistant',
        text: 'Não consegui acessar o microfone — verifique a permissão do navegador para este site.',
      });
    }
  }, [voice, stableOnUtterance, push]);

  const confirm = useCallback(async () => {
    if (!pending || loading) return;
    setLoading(true);
    let reply: string | null = null;
    try {
      const res = await fetch('/api/nexus/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: pending.id, slug: pending.slug, args: pending.args }),
      });
      const data = (await res.json().catch(() => ({ reply: 'Falhou.' }))) as ChatResponse;
      push({ role: 'assistant', text: data.reply });
      reply = data.reply;
    } finally {
      setPending(null);
      setLoading(false);
    }
    if (reply) await voice.speak(reply, ttsVoice);
  }, [pending, loading, push, voice, ttsVoice]);

  const cancel = useCallback(() => {
    setPending(null);
    push({ role: 'assistant', text: 'Cancelado — nada foi enfileirado.' });
  }, [push]);

  const toggleMic = useCallback(async () => {
    if (voice.recording) {
      const text = await voice.stopAndTranscribe();
      if (text) await send(text);
    } else {
      try {
        await voice.startRecording();
      } catch {
        push({
          role: 'assistant',
          text: 'Não consegui acessar o microfone — verifique a permissão do navegador para este site.',
        });
      }
    }
  }, [voice, send, push]);

  const hfStatus = voice.speaking
    ? 'Nexus falando…'
    : loading || voice.busy
      ? 'Processando…'
      : voice.listening
        ? 'Ouvindo… pode falar'
        : 'Mãos-livres ligado';

  // Sinais agregados para os visualizadores (barras/reactor): "falando" e "ativo".
  const speaking = voice.speaking;
  const active = voice.recording || voice.listening || voice.speaking || loading;
  // Estado do VoiceOrb: a IA falando manda; senão captação do usuário; senão repouso.
  const orbState: 'idle' | 'listening' | 'speaking' = speaking
    ? 'speaking'
    : voice.recording || voice.listening
      ? 'listening'
      : 'idle';

  return {
    messages,
    input,
    setInput,
    pending,
    loading,
    voice,
    ttsVoice,
    setTtsVoice,
    send,
    confirm,
    cancel,
    toggleMic,
    toggleHandsFree,
    hfStatus,
    speaking,
    active,
    orbState,
    levelRef: voice.levelRef,
  };
}

export type NexusChat = ReturnType<typeof useNexusChat>;
