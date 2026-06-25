import { requireOperator } from '../../lib/auth/server';
import { scopeFromClaims } from '../../lib/multitenant/scope';
import { getLatestAnalysis, listFunnelEvents } from '../../lib/services/analyses';
import { Shell } from '../../components/shell';
import { Badge, EmptyState, PageHeader, Table, Td, Th } from '../../components/ui';
import {
  formatCents,
  formatDate,
  formatInteger,
  formatRatioPercent,
} from '../../lib/domain/format';

export const dynamic = 'force-dynamic';

const STEP_LABELS: Record<string, string> = {
  impression: 'Impressão',
  link_click: 'Clique no link',
  landing_page_view: 'Visita à LP',
  view_content: 'Visualizou conteúdo',
  add_to_cart: 'Adicionou ao carrinho',
  initiate_checkout: 'Iniciou checkout',
  purchase: 'Compra',
};

export default async function FunnelPage() {
  const scope = scopeFromClaims(await requireOperator());

  let error: string | null = null;
  let analysis: Awaited<ReturnType<typeof getLatestAnalysis>> = null;
  let events: Awaited<ReturnType<typeof listFunnelEvents>> = [];
  try {
    analysis = await getLatestAnalysis(scope);
    if (analysis) events = await listFunnelEvents(analysis.id);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  return (
    <Shell>
      <PageHeader
        title="Funil de conversão"
        subtitle="As 7 etapas da análise mais recente, com conversão por etapa."
      />
      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}
      {!error && !analysis ? <EmptyState>Nenhuma análise com funil ainda.</EmptyState> : null}

      {analysis ? (
        <div className="mb-6 flex items-center gap-3 text-sm text-dim">
          <Badge value={analysis.overall_verdict} />
          <span>{analysis.objective ?? 'objetivo —'}</span>
          <span>·</span>
          <span>{formatDate(analysis.created_at)}</span>
        </div>
      ) : null}

      {events.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Etapa</Th>
              <Th>Nível</Th>
              <Th>Eventos</Th>
              <Th>Valor</Th>
              <Th>CVR da anterior</Th>
              <Th>CVR do topo</Th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id}>
                <Td>{STEP_LABELS[ev.event_type] ?? ev.event_type}</Td>
                <Td>{ev.level}</Td>
                <Td>{formatInteger(ev.count)}</Td>
                <Td>{formatCents(ev.value_cents)}</Td>
                <Td>{formatRatioPercent(ev.cvr_from_prev)}</Td>
                <Td>{formatRatioPercent(ev.cvr_from_top)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </Shell>
  );
}
