import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '../../../lib/auth/server';
import { getAccountDetail } from '../../../lib/services/accounts';
import { isSecretsVaultEnabled, serverEnv } from '../../../lib/env';
import { Shell } from '../../../components/shell';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
} from '../../../components/ui';
import { formatDate } from '../../../lib/domain/format';
import { ApiKeyForm } from '../../../components/settings/api-key-form';
import { ConnectionForm } from '../../../components/settings/connection-form';
import { EditConnectionButton } from '../../../components/settings/edit-connection-button';
import { DeleteConnectionButton } from '../../../components/settings/delete-connection-button';
import { SyncCampaignsButton } from '../../../components/settings/sync-campaigns-button';
import { ResetPasswordForm } from '../../../components/accounts/reset-password-form';
import { ArchiveAccountButton } from '../../../components/accounts/archive-account-button';
import { ImpersonateButton } from '../../../components/accounts/impersonate-button';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'agência',
  socio: 'sócio',
  cliente_usuario: 'cliente',
};

/** Mascara um segredo mostrando só os últimos 4 chars (o cipher nunca chega aqui). */
function mask(last4: string | null): string {
  return last4 ? `••••${last4}` : '—';
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // socio também vê (visibilidade global); só super_admin gerencia credenciais/plano (ADR 0029/0030).
  const claims = await requireRole(['super_admin', 'socio']);
  const isAdmin = claims.role === 'super_admin';
  const vaultOn = isSecretsVaultEnabled(serverEnv());

  const detail = await getAccountDetail(id);
  if (!detail) notFound();

  const { account, plan, planChanges, apiKeys, connections, clients } = detail;
  const fixedAccount = [{ id: account.id, name: account.name }];

  return (
    <Shell>
      <PageHeader
        title={account.name}
        subtitle={`Detalhe da conta — ${ROLE_LABEL[account.role] ?? account.role}`}
      />

      <div className="mb-6 flex items-center gap-2">
        <Link href="/accounts" className="text-xs text-accent hover:underline">
          ← Voltar para Contas
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardTitle>Status</CardTitle>
          <div className="flex gap-2">
            <Badge value={account.is_active ? 'ativa' : 'inativa'} />
            <Badge value={account.subscription_status} />
          </div>
        </Card>
        <Card>
          <CardTitle>Plano</CardTitle>
          <p className="text-sm text-ink/90">{plan?.name ?? account.plan}</p>
        </Card>
        <Card>
          <CardTitle>Trial expira</CardTitle>
          <p className="text-sm text-ink/90">{formatDate(account.trial_ends_at)}</p>
        </Card>
        <Card>
          <CardTitle>Período atual até</CardTitle>
          <p className="text-sm text-ink/90">{formatDate(account.current_period_end)}</p>
        </Card>
      </div>

      {isAdmin ? (
        <>
          {account.role !== 'super_admin' ? (
            <div className="mb-6">
              <ImpersonateButton accountId={account.id} />
            </div>
          ) : null}

          <h2 className="mt-8 mb-3 text-sm font-semibold text-ink/80">Redefinir senha</h2>
          <ResetPasswordForm accountId={account.id} />

          <h2 className="mt-8 mb-3 text-sm font-semibold text-danger/90">Zona de risco</h2>
          <ArchiveAccountButton accountId={account.id} slug={account.slug} />
        </>
      ) : null}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-ink/80">Histórico de plano</h2>
      {planChanges.length === 0 ? (
        <EmptyState>Nenhuma troca de plano registrada.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Alterado por</Th>
              <Th>Motivo</Th>
            </tr>
          </thead>
          <tbody>
            {planChanges.map((pc) => (
              <tr key={pc.id}>
                <Td>{formatDate(pc.created_at)}</Td>
                <Td>{pc.changed_by}</Td>
                <Td>{pc.reason ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-ink/80">Conexões Meta</h2>
      <p className="mb-3 text-xs text-dim">
        Esta conta pode ter mais de uma conta de anúncio conectada (ADR 0035). Cada campanha precisa
        informar qual usar — não há conexão padrão.
      </p>
      {isAdmin ? (
        <ConnectionForm accounts={fixedAccount} disabled={!vaultOn} fixedAccountId={account.id} />
      ) : null}
      {connections.length === 0 ? (
        <EmptyState>Nenhuma conexão Meta conectada ainda.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Ad account</Th>
              <Th>Rótulo</Th>
              <Th>Token</Th>
              <Th>Status</Th>
              <Th>Validado</Th>
              {isAdmin ? <Th right>Ações</Th> : null}
            </tr>
          </thead>
          <tbody>
            {connections.map((conn) => (
              <tr key={conn.id}>
                <Td>{conn.meta_ad_account_id}</Td>
                <Td>{conn.token_label ?? '—'}</Td>
                <Td>{mask(conn.access_token_last4)}</Td>
                <Td>
                  <Badge value={conn.status} />
                </Td>
                <Td>{formatDate(conn.last_validated_at)}</Td>
                {isAdmin ? (
                  <Td>
                    {vaultOn ? (
                      <div className="flex items-center justify-end gap-1">
                        <SyncCampaignsButton connectionId={conn.id} />
                        <EditConnectionButton
                          connection={conn}
                          clients={clients.map((cl) => ({ id: cl.id, name: cl.name }))}
                        />
                        <DeleteConnectionButton connectionId={conn.id} />
                      </div>
                    ) : null}
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-ink/80">Chaves de API</h2>
      {isAdmin ? (
        <ApiKeyForm accounts={fixedAccount} disabled={!vaultOn} fixedAccountId={account.id} />
      ) : null}
      {apiKeys.length === 0 ? (
        <EmptyState>Nenhuma chave de API cadastrada ainda.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Provedor</Th>
              <Th>Chave</Th>
              <Th>Status</Th>
              <Th>Validada</Th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => (
              <tr key={key.id}>
                <Td>{key.provider}</Td>
                <Td>{mask(key.key_last4)}</Td>
                <Td>
                  <Badge value={key.status} />
                </Td>
                <Td>{formatDate(key.last_validated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Shell>
  );
}
