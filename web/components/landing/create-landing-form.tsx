'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Pedido de criação de landing page a partir da aba (operador). Só dispara o job — o Trafegante
 * (runner headless) cria o rascunho `noindex` e encadeia a publicação. `client_slug` basta; subdomínio
 * e produto são opcionais (a skill resolve um default). Degrada com mensagens claras.
 */
export function CreateLandingForm({
  defaultClientSlug = 'cliente-exemplo',
}: {
  defaultClientSlug?: string;
}) {
  const router = useRouter();
  const [clientSlug, setClientSlug] = useState(defaultClientSlug);
  const [subdomain, setSubdomain] = useState('');
  const [productSlug, setProductSlug] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus('Enfileirando o pedido…');
    const res = await fetch('/api/landing/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_slug: clientSlug.trim(),
        ...(productSlug.trim() ? { product_slug: productSlug.trim() } : {}),
        ...(subdomain.trim() ? { subdomain: subdomain.trim() } : {}),
      }),
    });
    setBusy(false);
    if (res.status === 400) {
      setStatus('Dados inválidos — use slugs (minúsculas, números e hífen).');
      return;
    }
    if (!res.ok) {
      setStatus('Falha ao enfileirar — tente de novo.');
      return;
    }
    const data = (await res.json()) as { status: 'enqueued' | 'already_active' };
    setStatus(
      data.status === 'already_active'
        ? 'Já existe uma criação em andamento para este cliente — não enfileirei outra.'
        : 'Pedido enfileirado. O Trafegante vai gerar o rascunho em instantes — atualize em alguns segundos.',
    );
    router.refresh();
  }

  return (
    <div className="mb-6 rounded-lg border border-edge/60 bg-panel/70 p-5 backdrop-blur-sm panel-glow">
      <h3 className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-accent/70 uppercase">
        <span aria-hidden className="text-accent/50">
          ▸
        </span>
        Criar landing page
      </h3>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
          Cliente (slug)
          <input
            value={clientSlug}
            onChange={(e) => setClientSlug(e.target.value)}
            placeholder="cliente-exemplo"
            className="w-48 rounded-md border border-edge/70 bg-bg/60 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
          Produto (slug, opcional)
          <input
            value={productSlug}
            onChange={(e) => setProductSlug(e.target.value)}
            placeholder="curso-exemplo"
            className="w-48 rounded-md border border-edge/70 bg-bg/60 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
          Subdomínio (opcional)
          <input
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            placeholder="oferta"
            className="w-44 rounded-md border border-edge/70 bg-bg/60 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={busy || clientSlug.trim().length === 0}
          className="rounded-md border border-accent/50 bg-accent/15 px-4 py-1.5 text-[11px] font-semibold tracking-wider text-accent uppercase transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? 'Enviando…' : 'Criar rascunho'}
        </button>
      </form>
      {status ? <p className="mt-3 text-xs text-ink/70">{status}</p> : null}
    </div>
  );
}
