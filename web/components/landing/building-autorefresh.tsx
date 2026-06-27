'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Enquanto houver alguma LP em `building`, atualiza a lista sozinha (server refresh) a cada 15s — o
 * worker de publicação roda destacado (~10 min) e grava `deployed`+url ao terminar, então a tela
 * reflete a virada sem o operador precisar recarregar. Inerte quando não há nada em construção.
 */
export function BuildingAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}
