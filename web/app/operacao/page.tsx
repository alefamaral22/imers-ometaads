import { requireOperator } from '../../lib/auth/server';
import { scopeFromClaims } from '../../lib/multitenant/scope';
import { getOverviewMetrics } from '../../lib/services/overview-metrics';
import { getAgentPulse } from '../../lib/services/agent-jobs';
import { getLatestSnapshot } from '../../lib/services/live-snapshots';
import { listAnalyses } from '../../lib/services/analyses';
import { LiveOpsConsole, type LiveOpsData } from '../../components/ops/live-ops-console';

// Estado ao vivo: nunca prerender estático (lê DB no request com service_role).
export const dynamic = 'force-dynamic';

const BAD_VERDICTS = new Set(['underperforming', 'error', 'watch']);

function relativeLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return null;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

export default async function OperacaoPage() {
  const scope = scopeFromClaims(await requireOperator());

  const empty: LiveOpsData = {
    kpis: { spendCents: 0, campaigns: 0, impressions: 0, results: 0 },
    problems: 0,
    nextStep: null,
    snapshotAgeLabel: null,
    initialPulse: { active: 0, jobs: [] },
  };

  let data = empty;
  try {
    const [metrics, pulse, snapshot, analyses] = await Promise.all([
      getOverviewMetrics(scope),
      getAgentPulse(scope),
      getLatestSnapshot(scope),
      listAnalyses(scope, 10),
    ]);
    data = {
      kpis: {
        spendCents: metrics.kpis.spendCents,
        campaigns: metrics.kpis.campaigns,
        impressions: metrics.kpis.impressions,
        results: metrics.kpis.results,
      },
      problems: analyses.filter((a) => BAD_VERDICTS.has(a.overall_verdict)).length,
      nextStep: analyses[0]?.summary ?? null,
      snapshotAgeLabel: relativeLabel(snapshot?.created_at),
      initialPulse: {
        active: pulse.active,
        jobs: pulse.jobs.map((j) => ({ id: j.id, skill: j.skill, kind: j.kind, status: j.status })),
      },
    };
  } catch {
    // DB indisponível (ex.: TLS local) — o console ainda abre, só sem números.
    data = empty;
  }

  return <LiveOpsConsole data={data} />;
}
