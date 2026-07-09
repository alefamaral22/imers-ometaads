'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const ERRORS: Record<string, string> = {
  invalid_request: 'Dados inválidos. Confira o token.',
  vault_unconfigured: 'Cofre desligado: configure AD_TOKEN_ENC_KEY/API_KEY_ENC_KEY no ambiente.',
  unauthorized: 'Sessão expirada. Entre novamente.',
  auth_error: 'Token inválido ou sem permissão na Meta.',
  meta_error: 'Erro ao conectar com a Meta. Tente novamente.',
};

const input =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';

interface MetaAdAccount {
  id: string;
  name: string;
  accountStatus?: number;
  currency?: string;
  businessName?: string;
}

export function ConnectionForm({
  accounts,
  disabled,
  fixedAccountId,
}: {
  accounts: { id: string; name: string }[];
  disabled: boolean;
  /** Quando presente, esconde o <select> de conta e usa este id fixo (ex.: /accounts/[id]). */
  fixedAccountId?: string;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(fixedAccountId ?? accounts[0]?.id ?? '');
  const [token, setToken] = useState('');
  const [tokenLabel, setTokenLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Estado do fluxo de seleção de contas
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [metaAdAccounts, setMetaAdAccounts] = useState<MetaAdAccount[]>([]);
  const [selectedAdAccounts, setSelectedAdAccounts] = useState<Set<string>>(new Set());
  const [showAccountSelector, setShowAccountSelector] = useState(false);

  async function loadAdAccounts() {
    if (token.length < 20) {
      setError('Token muito curto.');
      return;
    }
    setLoadingAccounts(true);
    setError(null);
    try {
      const res = await fetch('/api/data/meta/load-ad-accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const code = body?.error ?? 'meta_error';
        setError(ERRORS[code] ?? body?.message ?? 'Erro ao carregar contas.');
        return;
      }
      const adAccounts: MetaAdAccount[] = body.adAccounts ?? [];
      if (adAccounts.length === 0) {
        setError('Nenhuma conta de anúncio encontrada para este token.');
        return;
      }
      setMetaAdAccounts(adAccounts);
      setSelectedAdAccounts(new Set(adAccounts.map((a) => a.id))); // Seleciona todas por padrão
      setShowAccountSelector(true);
    } catch {
      setError('Falha de rede.');
    } finally {
      setLoadingAccounts(false);
    }
  }

  function toggleAdAccount(id: string) {
    setSelectedAdAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedAdAccounts(new Set(metaAdAccounts.map((a) => a.id)));
  }

  function selectNone() {
    setSelectedAdAccounts(new Set());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedAdAccounts.size === 0) {
      setError('Selecione pelo menos uma conta de anúncio.');
      return;
    }
    setPending(true);
    setError(null);
    setOkMsg(null);

    // Cria uma conexão para cada conta selecionada
    const selected = Array.from(selectedAdAccounts);
    let successCount = 0;
    let lastError: string | null = null;

    for (const metaAdAccountId of selected) {
      try {
        const adAccount = metaAdAccounts.find((a) => a.id === metaAdAccountId);
        const label = tokenLabel || adAccount?.name || metaAdAccountId;
        const res = await fetch('/api/data/connections', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            accountId,
            metaAdAccountId,
            token,
            tokenLabel: label,
          }),
        });
        if (res.ok) {
          successCount++;
        } else {
          const body: unknown = await res.json().catch(() => null);
          console.error('Erro ao criar conexão:', body);
          const code =
            body && typeof body === 'object' && 'error' in body
              ? String(body.error)
              : 'invalid_request';
          // Mostrar mensagem mais específica
          if (code === 'invalid_request') {
            lastError = `Dados inválidos para conta ${metaAdAccountId}. Verifique se já não está conectada.`;
          } else {
            lastError = ERRORS[code] ?? 'Não foi possível salvar a conexão.';
          }
        }
      } catch {
        lastError = 'Falha de rede.';
      }
    }

    setPending(false);

    if (successCount > 0) {
      setToken('');
      setTokenLabel('');
      setMetaAdAccounts([]);
      setSelectedAdAccounts(new Set());
      setShowAccountSelector(false);
      const msg =
        successCount === 1
          ? 'Conexão salva. O token foi cifrado; será validado no próximo ciclo.'
          : `${successCount} conexões salvas. Os tokens foram cifrados.`;
      setOkMsg(lastError ? `${msg} (${selected.length - successCount} falharam)` : msg);
      router.refresh();
    } else if (lastError) {
      setError(lastError);
    }
  }

  function resetForm() {
    setShowAccountSelector(false);
    setMetaAdAccounts([]);
    setSelectedAdAccounts(new Set());
    setError(null);
  }

  // Status da conta Meta: 1=active, 2=disabled, 3=unsettled, etc.
  function accountStatusLabel(status?: number): string {
    if (status === 1) return '✓ Ativa';
    if (status === 2) return '⏸ Desativada';
    if (status === 3) return '⚠ Pendente';
    return '';
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 rounded-xl border border-edge/60 bg-panel/40 p-4"
    >
      {/* Linha 1: Conta interna + Token */}
      <div className="grid gap-3 sm:grid-cols-2">
        {fixedAccountId ? null : (
          <div>
            <label className="block text-xs text-dim">Conta</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={input}
              disabled={disabled || showAccountSelector}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={fixedAccountId ? 'sm:col-span-2' : ''}>
          <label className="block text-xs text-dim">System User token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (showAccountSelector) resetForm();
              }}
              autoComplete="off"
              className={input + ' flex-1'}
              disabled={disabled || showAccountSelector}
              required
              placeholder="Cole o token do gerenciador de anúncios"
            />
            {!showAccountSelector && (
              <button
                type="button"
                onClick={loadAdAccounts}
                disabled={disabled || loadingAccounts || token.length < 20}
                className="mt-1 rounded-md bg-accent/80 px-4 py-2 text-sm font-medium text-bg hover:bg-accent disabled:opacity-50"
              >
                {loadingAccounts ? 'Carregando…' : 'Carregar'}
              </button>
            )}
            {showAccountSelector && (
              <button
                type="button"
                onClick={resetForm}
                className="mt-1 rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm text-dim hover:text-fg"
              >
                Trocar token
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Seletor de contas de anúncio */}
      {showAccountSelector && metaAdAccounts.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-xs text-dim">
              Contas de anúncio ({selectedAdAccounts.size}/{metaAdAccounts.length} selecionadas)
            </label>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={selectAll} className="text-accent hover:underline">
                Todas
              </button>
              <span className="text-dim">|</span>
              <button type="button" onClick={selectNone} className="text-accent hover:underline">
                Nenhuma
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border border-edge/50 bg-bg/40">
            {metaAdAccounts.map((acc) => (
              <label
                key={acc.id}
                className="flex cursor-pointer items-center gap-3 border-b border-edge/30 px-3 py-2 last:border-b-0 hover:bg-panel/60"
              >
                <input
                  type="checkbox"
                  checked={selectedAdAccounts.has(acc.id)}
                  onChange={() => toggleAdAccount(acc.id)}
                  className="h-4 w-4 rounded border-edge/70 bg-bg/60 text-accent focus:ring-accent"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-sm">{acc.name}</span>
                    {acc.accountStatus && (
                      <span className="text-xs text-dim">{accountStatusLabel(acc.accountStatus)}</span>
                    )}
                  </div>
                  <div className="text-xs text-dim truncate">
                    {acc.id}
                    {acc.currency && ` · ${acc.currency}`}
                    {acc.businessName && ` · ${acc.businessName}`}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Rótulo opcional */}
      {showAccountSelector && (
        <div className="mt-3">
          <label className="block text-xs text-dim">Rótulo (opcional — aplica a todas)</label>
          <input
            value={tokenLabel}
            onChange={(e) => setTokenLabel(e.target.value)}
            placeholder="Ex.: System User — João"
            className={input}
            disabled={disabled}
          />
        </div>
      )}

      {/* Mensagens e botão de submit */}
      <div className="mt-3">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {okMsg ? <p className="text-sm text-pos">{okMsg}</p> : null}
        {showAccountSelector && (
          <button
            type="submit"
            disabled={disabled || pending || selectedAdAccounts.size === 0}
            className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
          >
            {pending
              ? 'Salvando…'
              : selectedAdAccounts.size === 1
                ? 'Conectar conta'
                : `Conectar ${selectedAdAccounts.size} contas`}
          </button>
        )}
      </div>
    </form>
  );
}
