'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Pedido de criação de landing page a partir da aba (operador). Só dispara o job — o Trafegante
 * (runner headless) cria o rascunho `noindex` e encadeia a publicação. `client_slug` basta; subdomínio
 * e produto são opcionais (a skill resolve um default). Opcionalmente o operador anexa IMAGENS e/ou
 * COPY manual: estes vão primeiro para o Storage (/landing/inputs → inputs_token) e o token segue no
 * /landing/create. Sem imagem/copy o fluxo é idêntico ao anterior (a IA gera tudo). Degrada com
 * mensagens claras.
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
  const [images, setImages] = useState<File[]>([]);
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const hasCopy =
    headline.trim() || subheadline.trim() || ctaLabel.trim() || notes.trim() ? true : false;
  const hasInputs = images.length > 0 || hasCopy;

  // Sobe imagens/copy (se houver) e devolve o inputs_token, ou null se nada a anexar.
  async function uploadInputs(): Promise<string | null> {
    if (!hasInputs) return null;
    const fd = new FormData();
    for (const f of images) fd.append('images', f);
    if (headline.trim()) fd.append('headline', headline.trim());
    if (subheadline.trim()) fd.append('subheadline', subheadline.trim());
    if (ctaLabel.trim()) fd.append('ctaLabel', ctaLabel.trim());
    if (notes.trim()) fd.append('notes', notes.trim());
    const res = await fetch('/api/landing/inputs', { method: 'POST', body: fd });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(uploadErrorMessage(data.error));
    }
    const data = (await res.json()) as { inputs_token: string };
    return data.inputs_token;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (hasInputs) setStatus('Enviando imagens/copy…');
      const inputsToken = await uploadInputs();

      setStatus('Enfileirando o pedido…');
      const res = await fetch('/api/landing/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_slug: clientSlug.trim(),
          ...(productSlug.trim() ? { product_slug: productSlug.trim() } : {}),
          ...(subdomain.trim() ? { subdomain: subdomain.trim() } : {}),
          ...(inputsToken ? { inputs_token: inputsToken } : {}),
        }),
      });
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
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Falha ao enviar — tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'rounded-md border border-edge/70 bg-bg/60 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent';

  return (
    <div className="mb-6 rounded-lg border border-edge/60 bg-panel/70 p-5 backdrop-blur-sm panel-glow">
      <h3 className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-accent/70 uppercase">
        <span aria-hidden className="text-accent/50">
          ▸
        </span>
        Criar landing page
      </h3>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
            Cliente (slug)
            <input
              value={clientSlug}
              onChange={(e) => setClientSlug(e.target.value)}
              placeholder="cliente-exemplo"
              className={`w-48 ${inputClass}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
            Produto (slug, opcional)
            <input
              value={productSlug}
              onChange={(e) => setProductSlug(e.target.value)}
              placeholder="curso-exemplo"
              className={`w-48 ${inputClass}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
            Subdomínio (opcional)
            <input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="oferta"
              className={`w-44 ${inputClass}`}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          className="self-start text-[10px] tracking-wider text-accent/70 uppercase hover:text-accent"
        >
          {showOptional ? '▾' : '▸'} Imagens e copy (opcional)
        </button>

        {showOptional ? (
          <div className="flex flex-col gap-3 rounded-md border border-edge/40 bg-bg/30 p-4">
            <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
              Imagens (até 8 — produto, logo, banner)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                onChange={(e) => setImages(Array.from(e.target.files ?? []))}
                className="text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-accent/15 file:px-3 file:py-1.5 file:text-accent"
              />
              {images.length > 0 ? (
                <span className="text-[11px] text-ink/60">
                  {images.length} imagem(ns) selecionada(s) — a IA posiciona no hero/seções.
                </span>
              ) : null}
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
                Headline (opcional)
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="deixe em branco p/ a IA gerar"
                  className={`w-64 ${inputClass}`}
                />
              </label>
              <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
                CTA (opcional)
                <input
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  placeholder="Quero começar"
                  className={`w-44 ${inputClass}`}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
              Descrição / subheadline (opcional)
              <input
                value={subheadline}
                onChange={(e) => setSubheadline(e.target.value)}
                placeholder="deixe em branco p/ a IA gerar"
                className={`w-full ${inputClass}`}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] tracking-wider text-dim uppercase">
              Notas p/ a IA (tom, bullets, oferta — opcional)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Ex.: tom direto, foco em quem já tentou e não conseguiu; bônus X incluso."
                className={`w-full resize-y ${inputClass}`}
              />
            </label>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy || clientSlug.trim().length === 0}
          className="self-start rounded-md border border-accent/50 bg-accent/15 px-4 py-1.5 text-[11px] font-semibold tracking-wider text-accent uppercase transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? 'Enviando…' : 'Criar rascunho'}
        </button>
      </form>
      {status ? <p className="mt-3 text-xs text-ink/70">{status}</p> : null}
    </div>
  );
}

function uploadErrorMessage(error: string | undefined): string {
  switch (error) {
    case 'too_many_images':
      return 'Máximo de 8 imagens.';
    case 'unsupported_type':
      return 'Formato não suportado — use PNG, JPG, WEBP ou GIF.';
    case 'image_too_large':
      return 'Imagem muito grande — máximo 5 MB cada.';
    default:
      return 'Falha ao enviar imagens/copy — tente de novo.';
  }
}
