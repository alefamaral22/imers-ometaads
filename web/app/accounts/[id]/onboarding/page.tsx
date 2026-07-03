import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '../../../../lib/auth/server';
import { getAccountDetail } from '../../../../lib/services/accounts';
import { isSecretsVaultEnabled, serverEnv } from '../../../../lib/env';
import { Shell } from '../../../../components/shell';
import { EmptyState, PageHeader } from '../../../../components/ui';
import { OnboardingWizard } from '../../../../components/accounts/onboarding-wizard';

export const dynamic = 'force-dynamic';

/**
 * Onboarding guiado pós-cadastro (SPEC-super-admin-completo §3.5). Anthropic/OpenAI/ElevenLabs têm
 * teste de conexão real (probe síncrono, Onda C); Meta/Minimax entram como "salvar e validar depois"
 * — mesma semântica de /settings (ADR 0035: Meta não tem probe síncrono no dashboard).
 */
export default async function OnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(['super_admin']); // mutação de credencial: só super_admin (ADR 0030)
  const vaultOn = isSecretsVaultEnabled(serverEnv());

  const detail = await getAccountDetail(id);
  if (!detail) notFound();

  return (
    <Shell>
      <PageHeader
        title={`Onboarding — ${detail.account.name}`}
        subtitle="Cadastre as credenciais da conta passo a passo. Meta pode ter mais de uma conexão."
      />

      <div className="mb-6">
        <Link href={`/accounts/${id}`} className="text-xs text-accent hover:underline">
          ← Voltar para o detalhe da conta
        </Link>
      </div>

      {!vaultOn ? (
        <EmptyState>
          Cofre desligado: configure <code>AD_TOKEN_ENC_KEY</code> e <code>API_KEY_ENC_KEY</code> no
          ambiente antes de iniciar o onboarding.
        </EmptyState>
      ) : (
        <OnboardingWizard accountId={detail.account.id} />
      )}
    </Shell>
  );
}
