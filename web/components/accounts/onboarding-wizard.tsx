'use client';

import { useState } from 'react';
import { ApiKeyForm } from '../settings/api-key-form';
import { ConnectionForm } from '../settings/connection-form';

type StepId = 'anthropic' | 'openai' | 'elevenlabs' | 'meta' | 'minimax';

interface Step {
  id: StepId;
  label: string;
  hint: string;
  probed: boolean; // true = validação síncrona real (Onda C); false = "salvo, validado depois"
}

const STEPS: Step[] = [
  { id: 'anthropic', label: 'Anthropic', hint: 'Chave de API da Anthropic.', probed: true },
  { id: 'openai', label: 'OpenAI', hint: 'Chave de API da OpenAI.', probed: true },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    hint: 'Chave de API da ElevenLabs (voz do Nexus).',
    probed: true,
  },
  {
    id: 'meta',
    label: 'Meta Ads',
    hint: 'Token de System User Meta. Pode cadastrar mais de um (múltiplas contas de anúncio).',
    probed: false,
  },
  { id: 'minimax', label: 'Minimax', hint: 'Chave de API da Minimax.', probed: false },
];

function StepDot({ state, index }: { state: 'done' | 'active' | 'pending'; index: number }) {
  if (state === 'done') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pos/20 text-[11px] text-pos">
        ✓
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-accent-2/60 bg-accent-2/10">
        <span aria-hidden className="reactor h-2.5 w-2.5" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-edge/70 text-[10px] text-dim">
      {index}
    </span>
  );
}

export function OnboardingWizard({ accountId }: { accountId: string }) {
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState<Set<StepId>>(new Set());

  const step = STEPS[current];
  const pct = Math.round((done.size / STEPS.length) * 100);

  function markDoneAndAdvance(id: StepId) {
    setDone((prev) => new Set(prev).add(id));
    if (current < STEPS.length - 1) setCurrent((c) => c + 1);
  }

  if (!step) return null;

  return (
    <div className="rounded-lg border border-accent-2/40 bg-panel/70 p-5 backdrop-blur-sm panel-glow">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-accent-2/80 uppercase">
          Onboarding de credenciais
        </h3>
        <span className="text-display text-[1.6rem] leading-none font-bold tabular-nums text-accent-2">
          {pct}%
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-accent-2 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>

      <ol className="mt-4 flex flex-wrap items-center gap-4">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <button type="button" onClick={() => setCurrent(i)} className="flex items-center gap-2">
              <StepDot
                state={done.has(s.id) ? 'done' : i === current ? 'active' : 'pending'}
                index={i + 1}
              />
              <span className={`text-xs ${i === current ? 'text-accent-2' : 'text-dim'}`}>
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-5 border-t border-edge/40 pt-4">
        <p className="mb-3 text-xs text-ink/70">{step.hint}</p>
        {step.probed ? (
          <p className="mb-3 text-[11px] text-dim">
            Esta chave é testada agora mesmo (probe real) — você vê ✓ ou ✗ ao salvar.
          </p>
        ) : (
          <p className="mb-3 text-[11px] text-dim">
            Esta credencial é salva e validada depois (sem teste síncrono nesta etapa).
          </p>
        )}

        {step.id === 'meta' ? (
          <ConnectionForm
            accounts={[{ id: accountId, name: 'Conta' }]}
            disabled={false}
            fixedAccountId={accountId}
          />
        ) : (
          <ApiKeyForm
            accounts={[{ id: accountId, name: 'Conta' }]}
            disabled={false}
            fixedAccountId={accountId}
          />
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => markDoneAndAdvance(step.id)}
            className="rounded-md bg-accent-2/15 px-3 py-1.5 text-xs font-medium text-accent-2 hover:bg-accent-2/25"
          >
            {step.id === 'meta'
              ? 'Marcar como configurado e avançar'
              : 'Marcar como concluído e avançar'}
          </button>
          {current < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrent((c) => c + 1)}
              className="text-xs text-dim hover:text-ink/80"
            >
              Pular por agora
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
