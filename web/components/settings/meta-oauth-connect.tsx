'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/**
 * ADR 0038 — "Conectar com Facebook". Duas fases na mesma tela:
 * 1) botão que manda para /api/oauth/meta/start (redirect para o diálogo da Meta);
 * 2) de volta em /settings?meta_oauth=ok, lista as contas da autorização pendente (cookie cifrado,
 *    lido só no servidor) para o operador escolher quais importar.
 * O token NUNCA passa por aqui — o cliente só vê ids/nomes de conta.
 */

const CALLBACK_MESSAGES: Record<string, { text: string; tone: 'pos' | 'danger' }> = {
  cancelled: { text: 'Autorização cancelada na Meta.', tone: 'danger' },
  invalid_state: {
    text: 'Autorização expirada ou inválida. Tente conectar novamente.',
    tone: 'danger',
  },
  forbidden: { text: 'Sem permissão para conectar nesta conta.', tone: 'danger' },
  exchange_failed: {
    text: 'A Meta recusou a troca do token. Confira o app e tente de novo.',
    tone: 'danger',
  },
  ok: { text: 'Autorizado na Meta. Escolha quais contas de anúncio importar.', tone: 'pos' },
};

interface MetaAdAccount {
  id: string;
  name: string;
  accountStatus?: number;
  currency?: string;
  businessName?: string;
}

export function MetaOAuthConnect({
  enabled,
  accounts,
  fixedAccountId,
}: {
  /** false quando META_APP_ID/META_APP_SECRET não estão no ambiente. */
  enabled: boolean;
  accounts: { id: string; name: string }[];
  /** Sem visibilidade global: conecta sempre na própria account (sem <select>). */
  fixedAccountId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackCode = searchParams.get('meta_oauth');

  const [accountId, setAccountId] = useState(fixedAccountId ?? accounts[0]?.id ?? '');
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data/meta/oauth-pending');
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? 'Não foi possível ler a autorização pendente.');
        return;
      }
      if (!body?.pending) return;
      const list: MetaAdAccount[] = body.adAccounts ?? [];
      setPendingAccountId(body.accountId ?? null);
      setAdAccounts(list);
      setSelected(new Set(list.map((a) => a.id)));
    } catch {
      setError('Falha de rede ao ler a autorização.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Só busca a autorização pendente quando voltamos do callback com sucesso.
  useEffect(() => {
    if (callbackCode === 'ok') void loadPending();
  }, [callbackCode, loadPending]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function discard() {
    await fetch('/api/data/meta/oauth-pending/discard', { method: 'POST' }).catch(() => {});
    setAdAccounts([]);
    setSelected(new Set());
    setPendingAccountId(null);
    router.replace('/settings');
  }

  async function finish() {
    if (!pendingAccountId || selected.size === 0) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/data/connections/oauth-finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: pendingAccountId,
          adAccountIds: Array.from(selected),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok && body?.ok !== true) {
        setError(
          body?.error === 'no_pending_authorization'
            ? 'A autorização expirou. Conecte novamente.'
            : 'Nenhuma conta pôde ser conectada (talvez já estejam conectadas).',
        );
        return;
      }
      const created: string[] = body?.created ?? [];
      const failed: string[] = body?.failed ?? [];
      setAdAccounts([]);
      setSelected(new Set());
      setPendingAccountId(null);
      setOkMsg(
        `${created.length} ${created.length === 1 ? 'conta conectada' : 'contas conectadas'}. ` +
          `Os tokens foram cifrados; serão validados no próximo ciclo.` +
          (failed.length > 0 ? ` ${failed.length} falharam.` : ''),
      );
      router.replace('/settings');
      router.refresh();
    } catch {
      setError('Falha de rede ao concluir a conexão.');
    } finally {
      setSaving(false);
    }
  }

  if (!enabled) {
    return (
      <p className="mb-4 text-xs text-dim">
        Login da Meta desligado: configure <code>META_APP_ID</code> e <code>META_APP_SECRET</code>{' '}
        para oferecer &ldquo;Conectar com Facebook&rdquo;. Enquanto isso, use o token manual abaixo.
      </p>
    );
  }

  const startHref = `/api/oauth/meta/start${
    fixedAccountId ? '' : accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
  }`;
  const callbackMsg = callbackCode ? CALLBACK_MESSAGES[callbackCode] : undefined;
  const hasPending = adAccounts.length > 0;

  return (
    <div className="mb-4 rounded-xl border border-edge/60 bg-panel/40 p-4">
      <div className="flex flex-wrap items-end gap-3">
        {fixedAccountId || accounts.length <= 1 ? null : (
          <div>
            <label className="block text-xs text-dim" htmlFor="meta-oauth-account">
              Conectar na conta
            </label>
            <select
              id="meta-oauth-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={hasPending}
              className="mt-1 rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {hasPending ? null : (
          <a
            href={startHref}
            className="rounded-md bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Conectar com Facebook
          </a>
        )}
        <p className="text-xs text-dim">
          O cliente autoriza na Meta e escolhe as contas — sem colar token.
        </p>
      </div>

      {callbackMsg && !okMsg ? (
        <p className={`mt-3 text-sm ${callbackMsg.tone === 'pos' ? 'text-pos' : 'text-danger'}`}>
          {callbackMsg.text}
        </p>
      ) : null}
      {loading ? <p className="mt-3 text-sm text-dim">Lendo contas na Meta…</p> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {okMsg ? <p className="mt-3 text-sm text-pos">{okMsg}</p> : null}

      {hasPending ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-dim">
              Contas de anúncio autorizadas ({selected.size}/{adAccounts.length} selecionadas)
            </span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelected(new Set(adAccounts.map((a) => a.id)))}
                className="text-accent hover:underline"
              >
                Todas
              </button>
              <span className="text-dim">|</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-accent hover:underline"
              >
                Nenhuma
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border border-edge/50 bg-bg/40">
            {adAccounts.map((acc) => (
              <label
                key={acc.id}
                className="flex cursor-pointer items-center gap-3 border-b border-edge/30 px-3 py-2 last:border-b-0 hover:bg-panel/60"
              >
                <input
                  type="checkbox"
                  checked={selected.has(acc.id)}
                  onChange={() => toggle(acc.id)}
                  className="h-4 w-4 rounded border-edge/70 bg-bg/60 text-accent focus:ring-accent"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{acc.name}</div>
                  <div className="truncate text-xs text-dim">
                    {acc.id}
                    {acc.currency ? ` · ${acc.currency}` : ''}
                    {acc.businessName ? ` · ${acc.businessName}` : ''}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={finish}
              disabled={saving || selected.size === 0}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
            >
              {saving
                ? 'Conectando…'
                : selected.size === 1
                  ? 'Conectar conta'
                  : `Conectar ${selected.size} contas`}
            </button>
            <button
              type="button"
              onClick={discard}
              disabled={saving}
              className="rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm text-dim hover:text-fg"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
