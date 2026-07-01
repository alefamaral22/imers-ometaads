'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const ERRORS: Record<string, string> = {
  invalid_request: 'Dados inválidos. Confira slug, nome e URLs (só https).',
  conflict: 'Já existe um cliente com esse slug.',
  forbidden: 'Sem permissão para cadastrar clientes.',
  unauthorized: 'Sessão expirada. Entre novamente.',
};

const input =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';

export function ClientForm() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [defaultLandingUrl, setDefaultLandingUrl] = useState('');
  const [dailyBudgetReais, setDailyBudgetReais] = useState('50');
  const [currency, setCurrency] = useState('BRL');
  const [adAccountId, setAdAccountId] = useState('');
  const [businessManagerId, setBusinessManagerId] = useState('');
  const [facebookPageId, setFacebookPageId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOkMsg(null);
    // Orçamento digitado em reais → centavos (SPEC: dinheiro sempre em centavos inteiros).
    const cents = Math.round(Number(dailyBudgetReais.replace(',', '.')) * 100);
    if (!Number.isInteger(cents) || cents < 0) {
      setError('Orçamento inválido — use apenas números (ex.: 50 ou 50,00).');
      setPending(false);
      return;
    }
    const payload: Record<string, unknown> = {
      slug,
      name,
      dailyBudgetCapCents: cents,
      currency,
    };
    if (defaultLandingUrl.trim()) payload.defaultLandingUrl = defaultLandingUrl.trim();
    if (adAccountId.trim()) payload.adAccountId = adAccountId.trim();
    if (businessManagerId.trim()) payload.businessManagerId = businessManagerId.trim();
    if (facebookPageId.trim()) payload.facebookPageId = facebookPageId.trim();
    try {
      const res = await fetch('/api/data/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSlug('');
        setName('');
        setDefaultLandingUrl('');
        setAdAccountId('');
        setBusinessManagerId('');
        setFacebookPageId('');
        setOkMsg('Cliente cadastrado. Já aparece na lista e no seletor de landing pages.');
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : 'invalid_request';
      setError(ERRORS[code] ?? 'Não foi possível cadastrar o cliente.');
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
          placeholder="centralizagroup"
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Centraliza Group"
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">URL da landing padrão (https, opcional)</label>
        <input
          value={defaultLandingUrl}
          onChange={(e) => setDefaultLandingUrl(e.target.value)}
          placeholder="https://centralizagroup.com"
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Orçamento diário / teto (R$)</label>
        <input
          value={dailyBudgetReais}
          onChange={(e) => setDailyBudgetReais(e.target.value)}
          inputMode="decimal"
          placeholder="50,00"
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
        <label className="block text-xs text-dim">Ad Account ID Meta (opcional)</label>
        <input
          value={adAccountId}
          onChange={(e) => setAdAccountId(e.target.value)}
          placeholder="act_123456789"
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Business Manager ID (opcional)</label>
        <input
          value={businessManagerId}
          onChange={(e) => setBusinessManagerId(e.target.value)}
          placeholder="123456789"
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Facebook Page ID (opcional)</label>
        <input
          value={facebookPageId}
          onChange={(e) => setFacebookPageId(e.target.value)}
          placeholder="123456789"
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
          {pending ? 'Cadastrando…' : 'Cadastrar cliente'}
        </button>
      </div>
    </form>
  );
}
