'use client';

import { useState } from 'react';

/** Link da landing publicada: abrir em nova aba + copiar para a área de transferência. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <a href={url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
        abrir
      </a>
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-edge/70 px-2 py-0.5 text-[10px] tracking-wider text-dim uppercase transition-colors hover:border-accent/40 hover:text-accent"
      >
        {copied ? 'copiado' : 'copiar'}
      </button>
    </span>
  );
}
