import { requireOperator } from '../../../lib/auth/server';
import { serverEnv, isSecretsVaultEnabled } from '../../../lib/env';
import { getCurrentScope } from '../../../lib/services/accounts';
import { listApiKeys } from '../../../lib/services/api-keys';
import { Shell } from '../../../components/shell';
import { Badge, EmptyState, PageHeader, Table, Td, Th } from '../../../components/ui';
import { formatDate } from '../../../lib/domain/format';
import { ApiKeyForm } from '../../../components/settings/api-key-form';

export const dynamic = 'force-dynamic';

/** Mascara um segredo mostrando só os últimos 4 chars (o cipher nunca chega aqui). */
function mask(last4: string | null): string {
  return last4 ? `••••${last4}` : '—';
}

/**
 * "Minhas chaves" — separado de /settings (chaves de tenant/cliente). Aqui o operador só vê/edita
 * a PRÓPRIA conta: sem <select> de conta, escopo vem de getCurrentScope() (sessão atual).
 */
export default async function MyKeysPage() {
  const claims = await requireOperator();
  const vaultOn = isSecretsVaultEnabled(serverEnv());

  let error: string | null = null;
  let apiKeys: Awaited<ReturnType<typeof listApiKeys>> = [];
  try {
    const scope = await getCurrentScope();
    apiKeys = await listApiKeys(scope);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  return (
    <Shell>
      <PageHeader
        title="Minhas chaves"
        subtitle="Chaves de API da sua própria conta — separadas das chaves de clientes em Conexões & chaves."
      />

      {!vaultOn ? (
        <EmptyState>
          Cofre desligado: configure <code>API_KEY_ENC_KEY</code> no ambiente para cadastrar chaves.
        </EmptyState>
      ) : null}
      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}

      <ApiKeyForm
        accounts={[{ id: claims.sub, name: 'Minha conta' }]}
        disabled={!vaultOn}
        fixedAccountId={claims.sub}
      />

      {!error && apiKeys.length === 0 ? (
        <EmptyState>Nenhuma chave cadastrada ainda.</EmptyState>
      ) : null}
      {apiKeys.length > 0 ? (
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
      ) : null}
    </Shell>
  );
}
