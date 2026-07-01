'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const ERRORS: Record<string, string> = {
  invalid_request: 'Dados inválidos. Confira slug, nome e valores.',
  conflict: 'Já existe um plano com esse slug.',
  forbidden: 'Sem permissão para criar planos.',
  unauthorized: 'Sessão expirada. Entre novamente.',
};

const input =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';

// Campo de limite: vazio = ilimitado (null). parseInt trata "" como NaN → mandamos null.
function limitOrNull(v: string): number | null {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function PlanForm() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [priceReais, setPriceReais] = useState('0');
  const [trialDays, setTrialDays] = useState('0');
  const [maxClients, setMaxClients] = useState('');
  const [maxLandingPages, setMaxLandingPages] = useState('');
  const [maxCampaigns, setMaxCampaigns] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOkMsg(null);
    try {
      const priceCents = Math.round(Number.parseFloat(priceReais.replace(',', '.')) * 100) || 0;
      const res = await fetch('/api/data/plans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          name,
          priceCents,
          trialDays: Number.parseInt(trialDays, 10) || 0,
          maxClients: limitOrNull(maxClients),
          maxLandingPages: limitOrNull(maxLandingPages),
          maxCampaigns: limitOrNull(maxCampaigns),
          maxUsers: limitOrNull(maxUsers),
        }),
      });
      if (res.ok) {
        setSlug('');
        setName('');
        setPriceReais('0');
        setTrialDays('0');
        setMaxClients('');
        setMaxLandingPages('');
        setMaxCampaigns('');
        setMaxUsers('');
        setOkMsg('Plano criado. Já aparece na lista e no cadastro de contas.');
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : 'invalid_request';
      setError(ERRORS[code] ?? 'Não foi possível criar o plano.');
    } catch {
      setError('Falha de rede.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 grid gap-3 rounded-xl border border-edge/60 bg-panel/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div>
        <label className="block text-xs text-dim">Slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="starter"
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Starter"
          className={input}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Preço (R$/mês)</label>
        <input
          value={priceReais}
          onChange={(e) => setPriceReais(e.target.value)}
          inputMode="decimal"
          placeholder="97,00"
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Trial (dias)</label>
        <input
          value={trialDays}
          onChange={(e) => setTrialDays(e.target.value)}
          inputMode="numeric"
          placeholder="0"
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Máx. clientes</label>
        <input
          value={maxClients}
          onChange={(e) => setMaxClients(e.target.value)}
          inputMode="numeric"
          placeholder="∞"
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Máx. landing pages</label>
        <input
          value={maxLandingPages}
          onChange={(e) => setMaxLandingPages(e.target.value)}
          inputMode="numeric"
          placeholder="∞"
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Máx. campanhas</label>
        <input
          value={maxCampaigns}
          onChange={(e) => setMaxCampaigns(e.target.value)}
          inputMode="numeric"
          placeholder="∞"
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Máx. usuários</label>
        <input
          value={maxUsers}
          onChange={(e) => setMaxUsers(e.target.value)}
          inputMode="numeric"
          placeholder="∞"
          className={input}
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <p className="text-[10px] text-dim">Campos de limite vazios = ilimitado.</p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {okMsg ? <p className="text-sm text-pos">{okMsg}</p> : null}
        <button
          type="submit"
          disabled={pending || slug.length < 2 || name.length < 2}
          className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
        >
          {pending ? 'Criando…' : 'Criar plano'}
        </button>
      </div>
    </form>
  );
}
