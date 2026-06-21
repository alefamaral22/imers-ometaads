'use client';

import { useState } from 'react';

interface SectionView {
  id: string;
  type: string;
  position: number;
  enabled: boolean;
  version: number;
  fields: Record<string, unknown> | null;
}

/**
 * Editor de rascunho de landing page (client). Edição pontual e síncrona de um campo (edit-path) com
 * concorrência otimista por versão; botão para iniciar o modo autônomo do Nexus. A validação profunda
 * acontece na publicação (serializer). Degrada com mensagens claras em erro/conflito de versão.
 */
export function SectionEditor({
  landingPageId,
  initialSections,
}: {
  landingPageId: string;
  initialSections: SectionView[];
}) {
  const [sections, setSections] = useState<SectionView[]>(initialSections);
  const [status, setStatus] = useState<string>('');

  async function save(type: string, version: number, path: string, value: string) {
    setStatus('Salvando…');
    const res = await fetch('/api/landing/section', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        landing_page_id: landingPageId,
        type,
        path,
        value,
        expectedVersion: version,
      }),
    });
    if (res.status === 409) {
      setStatus('Conflito de versão — recarregue a página.');
      return;
    }
    if (!res.ok) {
      setStatus('Falha ao salvar.');
      return;
    }
    const data = (await res.json()) as { version: number };
    setSections((prev) => prev.map((s) => (s.type === type ? { ...s, version: data.version } : s)));
    setStatus(`Salvo (v${data.version}).`);
  }

  async function startAutonomous() {
    setStatus('Iniciando modo autônomo…');
    const res = await fetch('/api/landing/autonomous', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target_kind: 'landing_page',
        target_id: landingPageId,
        session_id: `lp-${landingPageId}`,
      }),
    });
    setStatus(res.ok ? 'Modo autônomo iniciado.' : 'Falha ao iniciar.');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">{status || 'Edite um campo e salve.'}</p>
        <button
          type="button"
          onClick={startAutonomous}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-neutral-50 hover:bg-sky-500"
        >
          Modo autônomo
        </button>
      </div>
      {sections.map((s) => (
        <SectionCard key={s.id} section={s} onSave={save} />
      ))}
    </div>
  );
}

function SectionCard({
  section,
  onSave,
}: {
  section: SectionView;
  onSave: (type: string, version: number, path: string, value: string) => Promise<void>;
}) {
  const [path, setPath] = useState('headline');
  const [value, setValue] = useState('');

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-100">
          {section.type} <span className="text-neutral-500">· v{section.version}</span>
        </span>
        <span className="text-xs text-neutral-500">posição {section.position}</span>
      </div>
      <pre className="mb-3 max-h-32 overflow-auto rounded-md bg-neutral-950 p-2 text-xs text-neutral-400">
        {JSON.stringify(section.fields ?? {}, null, 2)}
      </pre>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(section.type, section.version, path, value);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="campo (ex.: cta.label)"
          className="w-40 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="novo valor"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
        />
        <button
          type="submit"
          className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-neutral-950 hover:bg-emerald-400"
        >
          Salvar
        </button>
      </form>
    </div>
  );
}
