'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Enquanto houver alguma LP em andamento (`draft` aguardando o publish ou `building`), atualiza a lista
 * sozinha (server refresh) a cada 12s — a criação roda no runner (Fly.io) destacada do dashboard e grava
 * `deployed`+url ao terminar, então a tela reflete a virada sem o operador precisar recarregar. Inerte
 * quando não há nada em andamento.
 */
export function BuildingAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 12000);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}
