import Link from 'next/link';
import { requireOperator } from '../../lib/auth/server';
import { scopeFromClaims } from '../../lib/multitenant/scope';
import { listLandingPages } from '../../lib/services/landing-pages';
import { Shell } from '../../components/shell';
import { Badge, EmptyState, PageHeader, Table, Td, Th } from '../../components/ui';
import { CreateLandingForm } from '../../components/landing/create-landing-form';
import { CopyLink } from '../../components/landing/copy-link';
import { BuildingAutoRefresh } from '../../components/landing/building-autorefresh';
import { LandingProgress } from '../../components/landing/landing-progress';
import { isInProgress } from '../../lib/landing/progress';
import { formatCents, formatDate } from '../../lib/domain/format';

export const dynamic = 'force-dynamic';

export default async function LandingPagesPage() {
  const scope = scopeFromClaims(await requireOperator());

  let error: string | null = null;
  let pages: Awaited<ReturnType<typeof listLandingPages>> = [];
  try {
    pages = await listLandingPages(scope, 200);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  // Há criação/publicação em andamento? Se sim, a lista se atualiza sozinha até virar deployed/failed.
  const inProgress = pages.filter((p) => isInProgress(p.status));

  return (
    <Shell>
      <PageHeader
        title="Landing pages"
        subtitle="Páginas geradas e publicadas. Rascunhos nascem noindex (preview)."
      />
      <CreateLandingForm />
      <BuildingAutoRefresh active={inProgress.length > 0} />

      {inProgress.map((p) => (
        <LandingProgress
          key={p.id}
          subdomain={p.subdomain}
          status={p.status}
          startedAt={p.updated_at}
        />
      ))}

      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}
      {!error && pages.length === 0 ? <EmptyState>Nenhuma landing page ainda.</EmptyState> : null}

      {pages.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Subdomínio</Th>
              <Th>Status</Th>
              <Th>Rascunho</Th>
              <Th>Link</Th>
              <Th>Preço</Th>
              <Th>Carrinho</Th>
              <Th>Index</Th>
              <Th>Atualizada</Th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id}>
                <Td>
                  {/* O subdomínio leva ao EDITOR (rascunho); o link ao vivo fica na coluna "Link". */}
                  <Link href={`/landing-pages/${p.id}`} className="text-accent hover:underline">
                    {p.subdomain}
                  </Link>
                </Td>
                <Td>
                  <Badge value={p.status} />
                </Td>
                <Td>{p.draft_status}</Td>
                <Td>
                  {p.url ? (
                    <CopyLink url={p.url} />
                  ) : p.status === 'building' ? (
                    <span className="flex items-center gap-1.5 text-accent-2">
                      <span aria-hidden className="reactor h-3 w-3" />
                      em construção — pode levar ~10 min
                    </span>
                  ) : (
                    <span className="text-dim">—</span>
                  )}
                </Td>
                <Td>{formatCents(p.price_cents)}</Td>
                <Td>{p.cart_state}</Td>
                <Td>{p.noindex ? 'noindex' : 'indexável'}</Td>
                <Td>{formatDate(p.updated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </Shell>
  );
}
