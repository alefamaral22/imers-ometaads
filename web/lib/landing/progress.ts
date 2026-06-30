/**
 * Lógica PURA do progresso de criação/publicação de uma landing page. A skill headless roda no runner
 * (Fly.io), desacoplada do dashboard: o estado vive em `landing_pages`, então fechar/atualizar a aba
 * NÃO interrompe nada. Como não há eventos granulares de build, a porcentagem é uma ESTIMATIVA honesta
 * por tempo decorrido (cresce até 95% e só fecha em 100% quando o status real vira `deployed`).
 */

export type LandingStatus = 'draft' | 'building' | 'deployed' | 'failed';

export type StepState = 'done' | 'active' | 'pending' | 'failed';

export interface ProgressStep {
  label: string;
  state: StepState;
}

// Tempo típico de uma publicação (Cloudflare Pages build + deploy). Base da estimativa, não promessa.
export const TYPICAL_BUILD_MS = 10 * 60 * 1000;

/** As 3 etapas visíveis ao operador, com o estado de cada uma derivado do status real do banco. */
export function landingSteps(status: LandingStatus): ProgressStep[] {
  const rascunho = 'Rascunho criado';
  const publicando = 'Publicando no servidor';
  const noAr = 'No ar';
  switch (status) {
    case 'draft':
      return [
        { label: rascunho, state: 'done' },
        { label: publicando, state: 'active' },
        { label: noAr, state: 'pending' },
      ];
    case 'building':
      return [
        { label: rascunho, state: 'done' },
        { label: publicando, state: 'active' },
        { label: noAr, state: 'pending' },
      ];
    case 'deployed':
      return [
        { label: rascunho, state: 'done' },
        { label: publicando, state: 'done' },
        { label: noAr, state: 'done' },
      ];
    case 'failed':
      return [
        { label: rascunho, state: 'done' },
        { label: publicando, state: 'failed' },
        { label: noAr, state: 'pending' },
      ];
  }
}

/**
 * Porcentagem estimada. `deployed` → 100; `failed` → 100 (barra cheia, mas marcada como falha pela cor);
 * `draft` → 10 (rascunho pronto, publish na fila); `building` → cresce de 15% a 95% conforme o tempo
 * decorrido se aproxima do típico, sem nunca cravar 100% antes de o banco confirmar `deployed`.
 */
export function estimateBuildPercent(
  status: LandingStatus,
  elapsedMs: number,
  typicalMs: number = TYPICAL_BUILD_MS,
): number {
  if (status === 'deployed' || status === 'failed') return 100;
  if (status === 'draft') return 10;
  const ratio = Math.min(1, Math.max(0, elapsedMs / typicalMs));
  return Math.min(95, Math.round(15 + ratio * 80));
}

/** Mensagem curta por status para o card de progresso. */
export function progressMessage(status: LandingStatus): string {
  switch (status) {
    case 'draft':
      return 'Rascunho pronto. A publicação entrou na fila e começa em instantes.';
    case 'building':
      return 'Gerando e publicando a página. Pode levar alguns minutos.';
    case 'deployed':
      return 'Página no ar.';
    case 'failed':
      return 'A publicação falhou. Você pode tentar publicar de novo.';
  }
}

/** Uma LP é "em andamento" (mostra progresso) quando ainda não está no ar nem falhou. */
export function isInProgress(status: LandingStatus): boolean {
  return status === 'draft' || status === 'building';
}
