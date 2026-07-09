'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface CreativeCardProps {
  id: string;
  name: string | null;
  headline: string | null;
  primaryText: string | null;
  imageUrl: string | null;
  status: string;
  source: string;
  prompt: string | null;
  feedback: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  pending_approval: 'Aguardando aprovação',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  archived: 'Arquivado',
};

const STATUS_COLOR: Record<string, string> = {
  draft: 'border-edge text-dim',
  pending_approval: 'border-warn/40 text-warn bg-warn/10',
  approved: 'border-pos/40 text-pos bg-pos/10',
  rejected: 'border-danger/40 text-danger bg-danger/10',
  archived: 'border-edge text-dim',
};

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  ai: 'Gerado por IA',
  trafegante: 'Trafegante',
};

export function CreativeCard({
  id,
  name,
  headline,
  primaryText,
  imageUrl,
  status,
  source,
  prompt,
  feedback,
  createdAt,
}: CreativeCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  async function handleAction(action: 'approved' | 'rejected' | 'archived' | 'draft') {
    setPending(action);
    const body: Record<string, unknown> = { status: action };
    if (action === 'rejected' && feedbackText.trim()) {
      body.feedback = feedbackText.trim();
    }
    try {
      const res = await fetch(`/api/data/creatives/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowFeedback(false);
        setFeedbackText('');
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  function handleDownload() {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = `/api/data/creatives/${id}/image?download=1`;
    a.download = `${name ?? 'criativo'}.png`;
    a.click();
  }

  const date = new Date(createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="group relative overflow-hidden rounded-lg border border-edge/60 bg-panel/70 backdrop-blur-sm transition-[border-color] duration-300 hover:border-accent/30">
      {/* Imagem */}
      <div className="relative aspect-square w-full overflow-hidden bg-bg/80">
        {imageUrl ? (
          <img
            src={`/api/data/creatives/${id}/image`}
            alt={name ?? 'Criativo'}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-dim">
            <span className="text-3xl opacity-30">◇</span>
          </div>
        )}
        {/* Badge de status flutuante */}
        <span
          className={`absolute top-2 right-2 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase backdrop-blur-sm ${STATUS_COLOR[status] ?? STATUS_COLOR.draft}`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {/* Conteúdo */}
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="truncate text-sm font-medium text-ink">{name ?? 'Sem nome'}</h4>
          <span className="shrink-0 text-[10px] text-dim">{SOURCE_LABEL[source] ?? source}</span>
        </div>

        {headline ? <p className="truncate text-xs text-ink/70">{headline}</p> : null}
        {primaryText ? <p className="line-clamp-2 text-xs text-dim">{primaryText}</p> : null}

        {prompt ? (
          <details className="text-[11px]">
            <summary className="cursor-pointer text-accent/60 hover:text-accent">Prompt</summary>
            <p className="mt-1 line-clamp-3 text-dim">{prompt}</p>
          </details>
        ) : null}

        {feedback ? (
          <p className="rounded-md border border-danger/20 bg-danger/5 p-2 text-[11px] text-danger/80">
            Feedback: {feedback}
          </p>
        ) : null}

        <p className="text-[10px] text-dim">{date}</p>

        {/* Ações */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {status === 'pending_approval' || status === 'draft' ? (
            <>
              <button
                type="button"
                onClick={() => void handleAction('approved')}
                disabled={pending !== null}
                className="rounded-md bg-pos/20 px-2.5 py-1 text-[11px] font-medium text-pos hover:bg-pos/30 disabled:opacity-50"
              >
                {pending === 'approved' ? '…' : '✓ Aprovar'}
              </button>
              <button
                type="button"
                onClick={() => setShowFeedback(!showFeedback)}
                disabled={pending !== null}
                className="rounded-md bg-danger/10 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
              >
                ✗ Rejeitar
              </button>
            </>
          ) : null}

          {status === 'rejected' ? (
            <button
              type="button"
              onClick={() => void handleAction('draft')}
              disabled={pending !== null}
              className="rounded-md bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              ↺ Voltar p/ rascunho
            </button>
          ) : null}

          {imageUrl ? (
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-md bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/20"
            >
              ↓ Baixar
            </button>
          ) : null}

          {status !== 'archived' ? (
            <button
              type="button"
              onClick={() => void handleAction('archived')}
              disabled={pending !== null}
              className="rounded-md px-2.5 py-1 text-[11px] text-dim hover:bg-white/5 disabled:opacity-50"
            >
              Arquivar
            </button>
          ) : null}
        </div>

        {/* Input de feedback (rejeição) */}
        {showFeedback ? (
          <div className="mt-2 space-y-2">
            <input
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Motivo da rejeição (opcional)"
              className="w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void handleAction('rejected')}
              disabled={pending !== null}
              className="rounded-md bg-danger/20 px-3 py-1 text-[11px] font-medium text-danger hover:bg-danger/30 disabled:opacity-50"
            >
              {pending === 'rejected' ? 'Rejeitando…' : 'Confirmar rejeição'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
