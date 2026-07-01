'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const ERRORS: Record<string, string> = {
  invalid_request: 'Dados inválidos. Confira slug, propostas de valor e URL (só https).',
  conflict: 'Já existe um produto com esse slug para este cliente.',
  forbidden: 'Sem permissão para cadastrar produtos.',
  unauthorized: 'Sessão expirada. Entre novamente.',
};

const input =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';

export function ProductForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [audience, setAudience] = useState('');
  const [valueProps, setValueProps] = useState('');
  const [tone, setTone] = useState('');
  const [landingUrl, setLandingUrl] = useState('');
  const [priceReais, setPriceReais] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [defaultSubdomain, setDefaultSubdomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOkMsg(null);
    // Uma proposta de valor por linha → array (mín. 1).
    const props = valueProps
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (props.length === 0) {
      setError('Informe ao menos uma proposta de valor (uma por linha).');
      setPending(false);
      return;
    }
    const cents = Math.round(Number(priceReais.replace(',', '.')) * 100);
    if (!Number.isInteger(cents) || cents < 0) {
      setError('Preço inválido — use apenas números (ex.: 197 ou 197,00).');
      setPending(false);
      return;
    }
    const payload: Record<string, unknown> = {
      clientId,
      slug,
      name,
      audience,
      valueProps: props,
      tone,
      landingUrl: landingUrl.trim(),
      priceCents: cents,
      currency,
    };
    if (defaultSubdomain.trim()) payload.defaultSubdomain = defaultSubdomain.trim();
    try {
      const res = await fetch('/api/data/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSlug('');
        setName('');
        setAudience('');
        setValueProps('');
        setTone('');
        setLandingUrl('');
        setPriceReais('');
        setDefaultSubdomain('');
        setOkMsg('Produto cadastrado. Já pode ser escolhido ao criar uma landing page.');
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : 'invalid_request';
      setError(ERRORS[code] ?? 'Não foi possível cadastrar o produto.');
    } catch {
      setError('Falha de rede.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 grid gap-3 rounded-xl border border-edge/60 bg-panel/40 p-4 sm:grid-cols-2"
    >
      <div>
        <label className="block text-xs text-dim">Slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="curso-x"
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Curso X"
          className={input}
          required
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-dim">Público-alvo</label>
        <textarea
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          rows={2}
          placeholder="Quem é o cliente ideal deste produto?"
          className={`${input} resize-y`}
          required
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-dim">Propostas de valor (uma por linha)</label>
        <textarea
          value={valueProps}
          onChange={(e) => setValueProps(e.target.value)}
          rows={4}
          placeholder={'Método validado\nSuporte da comunidade\nBônus exclusivos'}
          className={`${input} resize-y`}
          required
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-dim">Tom de voz</label>
        <input
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="direto, confiante e prático"
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">URL da landing (https)</label>
        <input
          value={landingUrl}
          onChange={(e) => setLandingUrl(e.target.value)}
          placeholder="https://cliente.com"
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Preço (R$)</label>
        <input
          value={priceReais}
          onChange={(e) => setPriceReais(e.target.value)}
          inputMode="decimal"
          placeholder="197,00"
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Moeda</label>
        <input
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          placeholder="BRL"
          className={input}
          maxLength={3}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Subdomínio padrão (opcional)</label>
        <input
          value={defaultSubdomain}
          onChange={(e) => setDefaultSubdomain(e.target.value.toLowerCase())}
          placeholder="curso-x"
          className={input}
        />
      </div>
      <div className="sm:col-span-2">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {okMsg ? <p className="text-sm text-pos">{okMsg}</p> : null}
        <button
          type="submit"
          disabled={pending || slug.length < 2 || name.length < 2}
          className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
        >
          {pending ? 'Cadastrando…' : 'Cadastrar produto'}
        </button>
      </div>
    </form>
  );
}
