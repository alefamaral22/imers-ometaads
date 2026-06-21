'use client';

/** Visualizador simples de atividade de voz: barras animadas quando ouvindo/processando. */
export function Visualizer({ active }: { active: boolean }) {
  const bars = [0, 1, 2, 3, 4];
  return (
    <div className="flex h-4 items-end gap-0.5" aria-hidden>
      {bars.map((i) => (
        <span
          key={i}
          className={`w-1 rounded-full bg-emerald-400 transition-all ${active ? 'animate-pulse' : ''}`}
          style={{ height: active ? `${6 + ((i * 7) % 12)}px` : '4px' }}
        />
      ))}
    </div>
  );
}
