'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoice } from './use-voice';
import { Visualizer } from './visualizer';
import { DEFAULT_MINIMAX_VOICE, MINIMAX_PT_VOICES } from '../../lib/nexus/domain/tts';

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
}

interface PendingAction {
  id: string;
  slug: string;
  summary: string;
  args: Record<string, string>;
}

interface ChatResponse {
  reply: string;
  pending?: PendingAction;
  job?: { status: string; jobId: string | null };
}

/**
 * Widget do Nexus (client). Chat por texto e voz. Dois modos de voz:
 *  - **Push-to-talk** (🎤): aperta para falar, aperta de novo para enviar.
 *  - **Mãos-livres**: escuta contínua com VAD — fala quando quiser, o Nexus responde por voz e volta a
 *    ouvir sozinho (sem apertar nada entre as falas). Anti-eco: a escuta pausa enquanto o Nexus fala.
 * Tools de escrita exigem CONFIRMAÇÃO em dois turnos antes de enfileirar um job. Degrada para texto
 * quando a voz/IA não estão configuradas no servidor (respostas 503 viram mensagem amigável).
 */
export function NexusWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(false);
  // Voz do TTS (só aplica ao provedor MiniMax; o ElevenLabs usa a voz da env e ignora).
  const [ttsVoice, setTtsVoice] = useState(DEFAULT_MINIMAX_VOICE);
  const voice = useVoice();

  const push = useCallback((m: ChatMsg) => setMessages((prev) => [...prev, m]), []);

  // Envia uma mensagem ao Nexus e FALA a resposta. Resolve só quando o áudio termina, para que o
  // loop de mãos-livres só volte a escutar depois que o Nexus parar de falar.
  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || loading) return;
      push({ role: 'user', text: trimmed });
      setInput('');
      setLoading(true);
      let reply: string | null = null;
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
      } finally {
        setLoading(false);
      }
      // Fala fora do bloco de loading: a UI já liberou, mas o caller (mãos-livres) aguarda o áudio.
      if (reply) await voice.speak(reply, ttsVoice);
    },
    [loading, messages, push, voice, ttsVoice],
  );

  // Mãos-livres: cada fala detectada vira um turno. Pausa a escuta durante o processamento (anti-eco
  // e evita turnos sobrepostos); a retomada acontece após o Nexus terminar de falar (send aguarda o TTS).
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

  // Wrapper estável: o hook guarda o callback no início do modo; usamos um ref para sempre chamar a
  // versão mais recente (com o histórico de mensagens atualizado), sem reiniciar a escuta.
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

  // Texto de estado do modo mãos-livres.
  const hfStatus = voice.speaking
    ? 'Nexus falando…'
    : loading || voice.busy
      ? 'Processando…'
      : voice.listening
        ? 'Ouvindo… pode falar'
        : 'Mãos-livres ligado';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-6 bottom-6 z-50 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-lg hover:bg-emerald-400"
      >
        Nexus
      </button>
    );
  }

  return (
    <div className="fixed right-6 bottom-6 z-50 flex h-[28rem] w-80 flex-col rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-neutral-100">Nexus</span>
          <Visualizer active={voice.recording || voice.listening || voice.speaking || loading} />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={ttsVoice}
            onChange={(e) => setTtsVoice(e.target.value)}
            aria-label="Voz do Nexus (MiniMax)"
            title="Voz do Nexus (aplica ao provedor MiniMax)"
            className="max-w-[8rem] rounded-md border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-xs text-neutral-200 outline-none focus:border-emerald-500"
          >
            {MINIMAX_PT_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-neutral-400 hover:text-neutral-100"
          >
            ×
          </button>
        </div>
      </header>

      {voice.supported ? (
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
          <button
            type="button"
            onClick={toggleHandsFree}
            aria-pressed={voice.handsFree}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              voice.handsFree
                ? 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400'
                : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
            }`}
          >
            <span aria-hidden>{voice.handsFree ? '🟢' : '🎙️'}</span>
            {voice.handsFree ? 'Mãos-livres ON' : 'Mãos-livres'}
          </button>
          {voice.handsFree ? (
            <span
              className={`text-xs ${voice.listening ? 'text-emerald-300' : 'text-neutral-400'}`}
              aria-live="polite"
            >
              {hfStatus}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
        {messages.length === 0 ? (
          <p className="text-neutral-500">
            Pergunte algo (ex.: “analisar cliente-exemplo”). Ligue o modo mãos-livres para conversar
            por voz sem apertar nada.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <span
                className={`inline-block rounded-lg px-3 py-1.5 ${
                  m.role === 'user'
                    ? 'bg-emerald-500/20 text-emerald-100'
                    : 'bg-neutral-800 text-neutral-200'
                }`}
              >
                {m.text}
              </span>
            </div>
          ))
        )}
      </div>

      {pending ? (
        <div className="border-t border-amber-700/40 bg-amber-500/10 px-4 py-2">
          <p className="mb-2 text-xs text-amber-200">{pending.summary}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-neutral-950 hover:bg-amber-400"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-md bg-neutral-700 px-3 py-1 text-xs text-neutral-100 hover:bg-neutral-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t border-neutral-800 px-3 py-2"
      >
        {voice.supported && !voice.handsFree ? (
          <button
            type="button"
            onClick={toggleMic}
            className={`rounded-md px-2 py-1.5 text-xs ${
              voice.recording ? 'bg-red-500 text-neutral-950' : 'bg-neutral-700 text-neutral-100'
            }`}
            aria-label={voice.recording ? 'Parar gravação' : 'Falar'}
          >
            {voice.recording ? '■' : '🎤'}
          </button>
        ) : null}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mensagem…"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
