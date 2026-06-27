'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { StatusBars } from './status-bars';
import { VoiceOrb } from '../nexus/voice-orb/voice-orb';
import { useNexusChat } from '../nexus/use-nexus-chat';
import { MINIMAX_PT_VOICES } from '../../lib/nexus/domain/tts';
import { formatCents, formatInteger } from '../../lib/domain/format';

interface PulseJob {
  id: string;
  skill: string;
  kind: string | null;
  status: string;
}

export interface LiveOpsData {
  kpis: { spendCents: number; campaigns: number; impressions: number; results: number };
  problems: number; // findings significativos da última análise (ou 0)
  nextStep: string | null; // próximo passo sugerido (resumo da análise / skill em voo)
  snapshotAgeLabel: string | null;
  initialPulse: { active: number; jobs: PulseJob[] };
}

const POLL_MS = 4000;

function useUptime(): string {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-edge/60 bg-panel/70 p-3 backdrop-blur-sm panel-glow ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px scan-top bg-gradient-to-r from-transparent via-accent to-transparent opacity-70"
      />
      <p className="mb-2 text-[9px] tracking-[0.22em] text-dim uppercase">{title}</p>
      {children}
    </div>
  );
}

export function LiveOpsConsole({ data }: { data: LiveOpsData }) {
  const nexus = useNexusChat();
  const uptime = useUptime();
  const [pulse, setPulse] = useState(data.initialPulse);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Polling leve do pulso dos agentes — alimenta o efeito "trabalhando" do reactor.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/data/ops-pulse');
        if (res.ok && alive) setPulse((await res.json()) as LiveOpsData['initialPulse']);
      } catch {
        /* mantém o último pulso conhecido */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [nexus.messages.length]);

  const working = pulse.active > 0;
  const speaking = nexus.speaking;
  const statusLabel = speaking
    ? 'FALANDO'
    : nexus.loading || nexus.voice.busy
      ? 'PROCESSANDO'
      : working
        ? 'AGENTES ATIVOS'
        : 'ONLINE';

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg text-ink">
      {/* topo */}
      <header className="relative z-10 flex items-center justify-between border-b border-edge/50 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-[0.18em] uppercase">
            Operação <span className="text-accent text-glow">ao vivo</span>
          </h1>
          <p className="text-[11px] text-dim">
            Painel Jarvis da agência — agentes, métricas e copiloto em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold tracking-wider uppercase ${
              working
                ? 'border-pos/50 bg-pos/10 text-pos'
                : 'border-edge/70 bg-panel/60 text-dim'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${working ? 'bg-pos' : 'bg-dim'}`} />
            {working ? `${pulse.active} agente(s)` : 'ocioso'}
          </span>
          <Link
            href="/"
            className="rounded-full border border-edge/70 px-3 py-1 text-[10px] tracking-wider text-dim uppercase transition-colors hover:border-accent/40 hover:text-accent"
          >
            ← Visão geral
          </Link>
        </div>
      </header>

      <div className="relative z-10 grid gap-4 p-4 lg:grid-cols-[300px_1fr_360px]">
        {/* ── coluna esquerda: core + próximo passo + status/fps ── */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          className="space-y-4"
        >
          <Panel title="Core · métricas vivas">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Campanhas" value={formatInteger(data.kpis.campaigns)} tone="text-accent" />
              <Metric label="Problemas" value={formatInteger(data.problems)} tone="text-warn" />
              <Metric label="Gasto" value={formatCents(data.kpis.spendCents)} tone="text-accent2" />
              <Metric label="Resultados" value={formatInteger(data.kpis.results)} tone="text-pos" />
            </div>
          </Panel>

          <Panel title="Tempo de sessão">
            <p className="font-mono text-3xl font-bold tracking-widest text-glow text-accent">{uptime}</p>
            <p className="mt-1 text-[10px] text-dim">
              {data.snapshotAgeLabel ? `Último raio-x ${data.snapshotAgeLabel}` : 'Sem raio-x recente'}
            </p>
          </Panel>

          <Panel title="Próximo passo">
            <p className="text-xs leading-relaxed text-ink/85">
              {pulse.jobs[0]
                ? `Agente em execução: ${pulse.jobs[0].skill}${pulse.jobs[0].kind ? ` (${pulse.jobs[0].kind})` : ''}.`
                : (data.nextStep ?? 'Sem ação pendente. Peça um raio-x ao Nexus para começar.')}
            </p>
          </Panel>

          <Panel title="Status / FPS">
            <StatusBars active={working || nexus.active} />
          </Panel>
        </motion.div>

        {/* ── centro: arc reactor ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-edge/40 bg-panel/20 p-6"
        >
          {/* backdrop: só a respiração ciano sob o reactor (sem grade — o foco é o globo neural) */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 50%, rgba(56,230,255,0.10), transparent 62%)',
            }}
          />
          <CornerBrackets />
          <span className="absolute top-3 left-4 z-10 text-[9px] tracking-[0.3em] text-accent/70 uppercase">
            Arc Reactor
          </span>
          <span className="absolute top-3 right-4 z-10 flex items-center gap-1.5 text-[9px] tracking-[0.2em] text-dim uppercase">
            <span className={`h-1.5 w-1.5 rounded-full ${working || speaking ? 'bg-accent' : 'bg-dim'}`} />
            {working || speaking ? 'live' : 'idle'}
          </span>
          <VoiceOrb size="lg" state={nexus.orbState} levelRef={nexus.levelRef} busy={working} />
          <p className="relative z-10 mt-4 text-center text-[11px] tracking-[0.25em] text-dim uppercase">
            {working
              ? 'Núcleo aquecido — agentes processando'
              : speaking
                ? 'Núcleo ressoando — Nexus falando'
                : 'Núcleo em repouso'}
          </p>
        </motion.div>

        {/* ── direita: copiloto Nexus ── */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="relative flex min-h-[70vh] flex-col overflow-hidden rounded-xl border border-accent/25 bg-panel/70 backdrop-blur-md glow">
          <div className="flex items-center justify-between border-b border-edge/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="reactor h-5 w-5" />
              <span className="text-xs font-bold tracking-[0.2em] uppercase">
                Co<span className="text-accent text-glow">piloto</span>
              </span>
            </div>
            <span
              className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wider uppercase ${
                speaking ? 'border-accent/50 bg-accent/15 text-accent' : 'border-edge/70 text-dim'
              }`}
              aria-live="polite"
            >
              {statusLabel}
            </span>
          </div>

          {/* visualizador circular que pulsa quando o Nexus fala */}
          <div className="flex items-center justify-center border-b border-edge/50 py-4">
            <VoiceOrb size="sm" state={nexus.orbState} levelRef={nexus.levelRef} px={112} />
          </div>

          {/* chat */}
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
            {nexus.messages.length === 0 ? (
              <p className="text-dim">
                Fale ou digite. Ex.: “como estão minhas campanhas agora?”. Ligue o mãos-livres para
                conversar sem apertar nada.
              </p>
            ) : (
              nexus.messages.map((m, i) => (
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

          {nexus.pending ? (
            <div className="border-t border-warn/30 bg-warn/5 px-4 py-2">
              <p className="mb-2 text-xs text-warn">{nexus.pending.summary}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={nexus.confirm}
                  className="rounded-md border border-warn/50 bg-warn/15 px-3 py-1 text-[11px] font-semibold tracking-wider text-warn uppercase transition-colors hover:bg-warn/25"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={nexus.cancel}
                  className="rounded-md border border-edge/70 px-3 py-1 text-[11px] tracking-wider text-dim uppercase transition-colors hover:text-ink"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {/* controles de voz */}
          {nexus.voice.supported ? (
            <div className="flex items-center justify-between border-t border-edge/60 px-4 py-2">
              <button
                type="button"
                onClick={nexus.toggleHandsFree}
                aria-pressed={nexus.voice.handsFree}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
                  nexus.voice.handsFree
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : 'border-edge/70 text-dim hover:border-accent/40 hover:text-accent'
                }`}
              >
                <span aria-hidden>{nexus.voice.handsFree ? '🟢' : '🎙️'}</span>
                {nexus.voice.handsFree ? 'Mãos-livres ON' : 'Mãos-livres'}
              </button>
              <span
                className={`text-[10px] tracking-wider uppercase ${nexus.voice.listening ? 'text-accent' : 'text-dim'}`}
                aria-live="polite"
              >
                {nexus.voice.handsFree ? nexus.hfStatus : ''}
              </span>
              <select
                value={nexus.ttsVoice}
                onChange={(e) => nexus.setTtsVoice(e.target.value)}
                aria-label="Voz do Nexus (MiniMax)"
                className="max-w-[7rem] rounded-md border border-edge/70 bg-bg/60 px-1.5 py-1 text-[11px] text-dim outline-none focus:border-accent"
              >
                {MINIMAX_PT_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void nexus.send(nexus.input);
            }}
            className="flex items-center gap-2 border-t border-edge/60 px-3 py-2"
          >
            {nexus.voice.supported && !nexus.voice.handsFree ? (
              <button
                type="button"
                onClick={nexus.toggleMic}
                className={`rounded-md border px-2 py-1.5 text-xs ${
                  nexus.voice.recording
                    ? 'border-danger/50 bg-danger/15 text-danger'
                    : 'border-edge/70 text-dim hover:border-accent/40 hover:text-accent'
                }`}
                aria-label={nexus.voice.recording ? 'Parar gravação' : 'Falar'}
              >
                {nexus.voice.recording ? '■' : '🎤'}
              </button>
            ) : null}
            <input
              value={nexus.input}
              onChange={(e) => nexus.setInput(e.target.value)}
              placeholder="Mensagem…"
              className="flex-1 rounded-md border border-edge/70 bg-bg/60 px-3 py-1.5 text-sm text-ink outline-none placeholder:text-dim/60 focus:border-accent"
            />
            <button
              type="submit"
              disabled={nexus.loading}
              className="rounded-md border border-accent/50 bg-accent/15 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-accent uppercase transition-colors hover:bg-accent/25 disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

/** Cantoneiras estilo HUD — moldura sci-fi barata e eficaz (aria-hidden). */
function CornerBrackets() {
  const base = 'absolute h-5 w-5 border-accent/50';
  return (
    <span aria-hidden className="pointer-events-none absolute inset-2 z-10">
      <span className={`${base} top-0 left-0 border-t border-l`} />
      <span className={`${base} top-0 right-0 border-t border-r`} />
      <span className={`${base} bottom-0 left-0 border-b border-l`} />
      <span className={`${base} right-0 bottom-0 border-r border-b`} />
    </span>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <p className="text-[9px] tracking-[0.18em] text-dim uppercase">{label}</p>
      <p className={`text-lg font-bold tracking-tight text-glow ${tone}`}>{value}</p>
    </div>
  );
}

