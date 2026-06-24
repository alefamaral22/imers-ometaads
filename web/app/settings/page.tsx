import { requireOperator } from '../../lib/auth/server';
import { serverEnv, isSecretsVaultEnabled } from '../../lib/env';
import { getCurrentScope, listAccounts } from '../../lib/services/accounts';
import { listConnections } from '../../lib/services/connections';
import { listApiKeys } from '../../lib/services/api-keys';
import { Shell } from '../../components/shell';
import { Badge, EmptyState, PageHeader, Table, Td, Th } from '../../components/ui';
import { formatDate } from '../../lib/domain/format';

export const dynamic = 'force-dynamic';

/** Mascara um segredo mostrando só os últimos 4 chars (o cipher nunca chega aqui). */
function mask(last4: string | null): string {
  return last4 ? `••••${last4}` : '—';
}

export default async function SettingsPage() {
  await requireOperator();

  const vaultOn = isSecretsVaultEnabled(serverEnv());

  let error: string | null = null;
  let connections: Awaited<ReturnType<typeof listConnections>> = [];
  let apiKeys: Awaited<ReturnType<typeof listApiKeys>> = [];
  let accountName = new Map<string, string>();
  try {
    const scope = await getCurrentScope();
    const accounts = await listAccounts();
    accountName = new Map(accounts.map((a) => [a.id, a.name]));
    [connections, apiKeys] = await Promise.all([listConnections(scope), listApiKeys(scope)]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  return (
    <Shell>
      <PageHeader
        title="Conexões & chaves"
        subtitle="Tokens Meta e chaves de API por conta. Segredos ficam cifrados em repouso — só os últimos 4 caracteres aparecem aqui."
      />

      {!vaultOn ? (
        <EmptyState>
          Cofre desligado: configure <code>AD_TOKEN_ENC_KEY</code> e <code>API_KEY_ENC_KEY</code> no
          ambiente para cadastrar/rotacionar segredos. A leitura continua disponível.
        </EmptyState>
      ) : null}
      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-neutral-300">Conexões Meta</h2>
      {!error && connections.length === 0 ? (
        <EmptyState>Nenhuma conexão Meta conectada ainda.</EmptyState>
      ) : null}
      {connections.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Conta</Th>
              <Th>Ad account</Th>
              <Th>Método</Th>
              <Th>Token</Th>
              <Th>Status</Th>
              <Th>Validado</Th>
            </tr>
          </thead>
          <tbody>
            {connections.map((conn) => (
              <tr key={conn.id}>
                <Td>{accountName.get(conn.account_id) ?? conn.account_id}</Td>
                <Td>{conn.meta_ad_account_id}</Td>
                <Td>{conn.connection_method}</Td>
                <Td>{mask(conn.access_token_last4)}</Td>
                <Td>
                  <Badge value={conn.status} />
                </Td>
                <Td>{formatDate(conn.last_validated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-neutral-300">Chaves de API</h2>
      {!error && apiKeys.length === 0 ? (
        <EmptyState>Nenhuma chave de API cadastrada ainda.</EmptyState>
      ) : null}
      {apiKeys.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Conta</Th>
              <Th>Provedor</Th>
              <Th>Chave</Th>
              <Th>Status</Th>
              <Th>Validada</Th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => (
              <tr key={key.id}>
                <Td>{accountName.get(key.account_id) ?? key.account_id}</Td>
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
      ) : null}
    </Shell>
  );
}
