'use client';

import { useCallback, useState } from 'react';
import { useVoice } from './use-voice';
import { Visualizer } from './visualizer';

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
 * Widget do Nexus (client). Chat por texto e voz; tools de escrita exigem CONFIRMAÇÃO em dois turnos
 * (barra Confirmar/Cancelar) antes de enfileirar um job. Degrada para texto quando a voz/IA não
 * estão configuradas no servidor (respostas 503 viram mensagem amigável).
 */
export function NexusWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(false);
  const voice = useVoice();

  const push = useCallback((m: ChatMsg) => setMessages((prev) => [...prev, m]), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || loading) return;
      push({ role: 'user', text: trimmed });
      setInput('');
      setLoading(true);
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
            text: 'Nexus indisponível: configure CLAUDE_API_KEY no servidor.',
          });
          return;
        }
        if (!res.ok) {
          push({ role: 'assistant', text: 'Não consegui processar agora.' });
          return;
        }
        const data = (await res.json()) as ChatResponse;
        push({ role: 'assistant', text: data.reply });
        setPending(data.pending ?? null);
        void voice.speak(data.reply);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, push, voice],
  );

  const confirm = useCallback(async () => {
    if (!pending || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/nexus/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: pending.id, slug: pending.slug, args: pending.args }),
      });
      const data = (await res.json().catch(() => ({ reply: 'Falhou.' }))) as ChatResponse;
      push({ role: 'assistant', text: data.reply });
      void voice.speak(data.reply);
    } finally {
      setPending(null);
      setLoading(false);
    }
  }, [pending, loading, push, voice]);

  const cancel = useCallback(() => {
    setPending(null);
    push({ role: 'assistant', text: 'Cancelado — nada foi enfileirado.' });
  }, [push]);

  const toggleMic = useCallback(async () => {
    if (voice.recording) {
      const text = await voice.stopAndTranscribe();
      if (text) await send(text);
    } else {
      await voice.startRecording();
    }
  }, [voice, send]);

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
          <Visualizer active={voice.recording || loading} />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-neutral-400 hover:text-neutral-100"
        >
          ×
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
        {messages.length === 0 ? (
          <p className="text-neutral-500">Pergunte algo (ex.: “analisar cliente-exemplo”).</p>
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
        {voice.supported ? (
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
