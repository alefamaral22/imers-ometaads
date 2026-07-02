import Link from 'next/link';
import { requireRole } from '../../lib/auth/server';
import { listAccounts } from '../../lib/services/accounts';
import { listPlans } from '../../lib/services/plans';
import { Shell } from '../../components/shell';
import { Badge, EmptyState, PageHeader, Table, Td, Th } from '../../components/ui';
import { formatDate } from '../../lib/domain/format';
import { AccountForm } from '../../components/accounts/account-form';
import { AccountToggle } from '../../components/accounts/account-toggle';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'agência',
  socio: 'sócio',
  cliente_usuario: 'cliente',
};

export default async function AccountsPage() {
  // socio também vê (visibilidade global), mas só super_admin cria/ativa/desativa (ADR 0029/0030).
  const claims = await requireRole(['super_admin', 'socio']);
  const isAdmin = claims.role === 'super_admin';

  let error: string | null = null;
  let accounts: Awaited<ReturnType<typeof listAccounts>> = [];
  let plans: { slug: string; name: string }[] = [];
  try {
    accounts = await listAccounts();
    plans = (await listPlans(true)).map((p) => ({ slug: p.slug, name: p.name }));
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  return (
    <Shell>
      <PageHeader
        title="Contas"
        subtitle={
          isAdmin
            ? 'Provisione clientes e sócios. A senha inicial é cifrada (scrypt); desativar corta o login na hora.'
            : 'Contas da plataforma (somente leitura).'
        }
      />

      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}

      {isAdmin ? <AccountForm plans={plans} /> : null}

      {!error && accounts.length === 0 ? (
        <EmptyState>Nenhuma conta cadastrada ainda.</EmptyState>
      ) : null}

      {accounts.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Conta</Th>
              <Th>Papel</Th>
              <Th>Plano</Th>
              <Th>E-mail</Th>
              <Th>Status</Th>
              <Th>Assinatura</Th>
              <Th>Último login</Th>
              <Th> </Th>
              {isAdmin ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              // O servidor barra desativar a si mesmo ou um super_admin; aqui nem renderiza o botão.
              const togglable = isAdmin && a.role !== 'super_admin' && a.id !== claims.sub;
              return (
                <tr key={a.id}>
                  <Td>{a.name}</Td>
                  <Td>{ROLE_LABEL[a.role] ?? a.role}</Td>
                  <Td>{a.plan}</Td>
                  <Td>{a.email ?? '—'}</Td>
                  <Td>
                    <Badge value={a.is_active ? 'ativa' : 'inativa'} />
                  </Td>
                  <Td>
                    <Badge value={a.subscription_status} />
                  </Td>
                  <Td>{formatDate(a.last_login_at)}</Td>
                  <Td>
                    <Link href={`/accounts/${a.id}`} className="text-accent hover:underline">
                      Ver detalhe
                    </Link>
                  </Td>
                  {isAdmin ? (
                    <Td>{togglable ? <AccountToggle id={a.id} isActive={a.is_active} /> : null}</Td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : null}
    </Shell>
  );
}
