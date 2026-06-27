'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { VoiceOrb } from './voice-orb/voice-orb';
import { useNexusChat } from './use-nexus-chat';
import { MINIMAX_PT_VOICES } from '../../lib/nexus/domain/tts';

/**
 * Widget do Nexus (canto). Toda a lógica de chat/voz vive em `useNexusChat` (compartilhada com o
 * console "Operação ao vivo"); aqui é só a apresentação compacta:
 *  - **Push-to-talk** (🎤): aperta para falar, aperta de novo para enviar.
 *  - **Mãos-livres**: escuta contínua com VAD; o Nexus responde por voz e volta a ouvir sozinho.
 * Tools de escrita exigem CONFIRMAÇÃO em dois turnos antes de enfileirar um job.
 */
export function NexusWidget() {
  const [open, setOpen] = useState(false);
  const {
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
    levelRef,
  } = useNexusChat();

  // Rola para a última mensagem.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const statusLabel = speaking
    ? 'FALANDO'
    : loading || voice.busy
      ? 'PROCESSANDO'
      : voice.listening
        ? 'OUVINDO'
        : 'ONLINE';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full border border-accent/40 bg-panel/90 px-5 py-3 text-[11px] font-semibold tracking-[0.18em] text-accent uppercase shadow-[0_0_30px_-6px_rgba(56,230,255,0.6)] backdrop-blur transition-colors hover:bg-accent/10"
      >
        <span aria-hidden className="reactor h-4 w-4" />
        Nexus
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="glow-strong fixed right-6 bottom-6 z-50 flex h-[34rem] w-[22rem] flex-col overflow-hidden rounded-xl border border-accent/25 bg-panel/95 backdrop-blur-md"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px scan-top bg-gradient-to-r from-transparent via-accent to-transparent"
      />
      <header className="flex items-center justify-between border-b border-edge/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="reactor h-4 w-4" />
          <span className="text-display text-sm font-bold tracking-[0.16em] text-ink uppercase">
            Ne<span className="text-accent text-glow">xus</span>
          </span>
          <span
            className={`ml-1 rounded-full border px-2 py-0.5 text-[8px] font-semibold tracking-[0.15em] uppercase ${
              speaking || active
                ? 'border-accent/50 bg-accent/15 text-accent'
                : 'border-edge/70 text-dim'
            }`}
            aria-live="polite"
          >
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={ttsVoice}
            onChange={(e) => setTtsVoice(e.target.value)}
            aria-label="Voz do Nexus (MiniMax)"
            title="Voz do Nexus (aplica ao provedor MiniMax)"
            className="max-w-[7rem] rounded-md border border-edge/70 bg-bg/60 px-1.5 py-1 text-[11px] text-dim outline-none focus:border-accent"
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
            aria-label="Fechar Nexus"
            className="text-lg leading-none text-dim transition-colors hover:text-accent"
          >
            ×
          </button>
        </div>
      </header>

      {/* faixa de fala ao vivo — orbe que pulsa quando o Nexus fala/ouve */}
      <div className="relative flex items-center justify-center border-b border-edge/50 bg-bg/30 py-4">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 50% 60%, rgba(56,230,255,0.08), transparent 60%)',
          }}
        />
        <VoiceOrb size="sm" state={orbState} levelRef={levelRef} px={84} />
      </div>

      {voice.supported ? (
        <div className="flex items-center justify-between border-b border-edge/60 px-4 py-2">
          <button
            type="button"
            onClick={toggleHandsFree}
            aria-pressed={voice.handsFree}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
              voice.handsFree
                ? 'border-accent/50 bg-accent/15 text-accent'
                : 'border-edge/70 text-dim hover:border-accent/40 hover:text-accent'
            }`}
          >
            <span aria-hidden>{voice.handsFree ? '🟢' : '🎙️'}</span>
            {voice.handsFree ? 'Mãos-livres ON' : 'Mãos-livres'}
          </button>
          {voice.handsFree ? (
            <span
              className={`text-[10px] tracking-wider uppercase ${voice.listening ? 'text-accent' : 'text-dim'}`}
              aria-live="polite"
            >
              {hfStatus}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
        {messages.length === 0 ? (
          <p className="text-dim">
            Pergunte algo (ex.: “como estão minhas campanhas agora?”). Ligue o modo mãos-livres para
            conversar por voz sem apertar nada.
          </p>
        ) : (
          messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={m.role === 'user' ? 'text-right' : 'text-left'}
            >
              <span
                className={`inline-block rounded-lg border px-3 py-1.5 ${
                  m.role === 'user'
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-edge/50 bg-bg/50 text-ink/90'
                }`}
              >
                {m.text}
              </span>
            </motion.div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {pending ? (
        <div className="border-t border-warn/30 bg-warn/5 px-4 py-2">
          <p className="mb-2 text-xs text-warn">{pending.summary}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              className="rounded-md border border-warn/50 bg-warn/15 px-3 py-1 text-[11px] font-semibold tracking-wider text-warn uppercase transition-colors hover:bg-warn/25"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-md border border-edge/70 px-3 py-1 text-[11px] tracking-wider text-dim uppercase transition-colors hover:text-ink"
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
        className="flex items-center gap-2 border-t border-edge/60 px-3 py-2"
      >
        {voice.supported && !voice.handsFree ? (
          <button
            type="button"
            onClick={toggleMic}
            className={`rounded-md border px-2 py-1.5 text-xs ${
              voice.recording
                ? 'border-danger/50 bg-danger/15 text-danger'
                : 'border-edge/70 text-dim hover:border-accent/40 hover:text-accent'
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
          className="flex-1 rounded-md border border-edge/70 bg-bg/60 px-3 py-1.5 text-sm text-ink outline-none placeholder:text-dim/60 focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md border border-accent/50 bg-accent/15 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-accent uppercase transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </motion.div>
  );
}
