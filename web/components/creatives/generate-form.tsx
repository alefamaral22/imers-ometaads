'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CREATIVE_CATEGORIES } from '../../lib/domain/creative-categories';

const ERRORS: Record<string, string> = {
  openai_key_missing: 'Chave OpenAI não cadastrada. Cadastre em Conexões & chaves.',
  openai_key_invalid: 'Chave OpenAI inválida. Rotacione em Conexões & chaves.',
  openai_auth_error: 'Chave OpenAI sem permissão para gerar imagens.',
  openai_rate_limit: 'Limite de requisições da OpenAI atingido. Tente novamente em breve.',
  openai_error: 'Erro na OpenAI. Tente novamente.',
  invalid_request: 'Dados inválidos. Confira os campos.',
  unauthorized: 'Sessão expirada. Entre novamente.',
};

const input =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent';
const textarea =
  'mt-1 w-full rounded-md border border-edge/70 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent resize-y min-h-[80px]';

export function GenerateCreativeForm({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('trafego-pago');
  const [headline, setHeadline] = useState('');
  const [primaryText, setPrimaryText] = useState('');
  const [size, setSize] = useState<'1024x1024' | '1536x1024' | '1024x1536'>('1024x1024');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [images, setImages] = useState<FileList | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    const cleanPrompt = prompt.trim();
    const creativeName = name.trim() || cleanPrompt.slice(0, 60) || 'Criativo IA';
    try {
      const fd = new FormData();
      fd.set('clientId', clientId);
      fd.set('prompt', cleanPrompt);
      fd.set('name', creativeName);
      fd.set('categoryId', categoryId);
      if (headline) fd.set('headline', headline);
      if (primaryText) fd.set('primaryText', primaryText);
      fd.set('size', size);
      fd.set('quality', quality);
      Array.from(images ?? [])
        .slice(0, 3)
        .forEach((file) => fd.append('images', file));

      const res = await fetch('/api/data/creatives/generate', {
        method: 'POST',
        body: fd,
      });
      if (res.ok) {
        setPrompt('');
        setName('');
        setHeadline('');
        setPrimaryText('');
        setImages(null);
        setSuccess('Criativo gerado com sucesso! Aguardando aprovação.');
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : 'invalid_request';
      setError(ERRORS[code] ?? 'Não foi possível gerar o criativo.');
    } catch {
      setError('Falha de rede.');
    } finally {
      setPending(false);
    }
  }

  if (clients.length === 0) {
    return (
      <p className="text-sm text-dim">Cadastre ao menos um cliente antes de gerar criativos.</p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 rounded-xl border border-edge/60 bg-panel/40 p-4 sm:grid-cols-2"
    >
      <div>
        <label className="block text-xs text-dim">Cliente</label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={input}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-dim">Categoria do nicho</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={input}
        >
          {CREATIVE_CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-dim">Nome do criativo (opcional)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Auto-preenchido do prompt se vazio"
          className={input}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-dim">Prompt para a IA (descreva a imagem)</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Uma imagem profissional para anúncio de curso online, com cores vibrantes e texto de destaque..."
          className={textarea}
          required
          minLength={5}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Headline (opcional)</label>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Oferta imperdível"
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Texto principal (opcional)</label>
        <input
          value={primaryText}
          onChange={(e) => setPrimaryText(e.target.value)}
          placeholder="Aprenda as técnicas que..."
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-dim">Tamanho</label>
        <select
          value={size}
          onChange={(e) => setSize(e.target.value as typeof size)}
          className={input}
        >
          <option value="1024x1024">1024×1024 (quadrado)</option>
          <option value="1536x1024">1536×1024 (paisagem)</option>
          <option value="1024x1536">1024×1536 (retrato)</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-dim">Qualidade</label>
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value as typeof quality)}
          className={input}
        >
          <option value="low">Baixa (rápido)</option>
          <option value="medium">Média</option>
          <option value="high">Alta (mais detalhes)</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-dim">
          Imagens de referência (logo, foto do produto, até 3)
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(e) => setImages(e.target.files)}
          className="mt-1 w-full text-sm text-dim file:mr-3 file:rounded-md file:border file:border-edge/70 file:bg-bg/60 file:px-3 file:py-1.5 file:text-xs file:text-ink file:outline-none hover:file:border-accent"
        />
        <p className="mt-1 text-[10px] text-dim">
          Opcional. Suba logo, foto de pessoa ou produto pra IA incorporar no flyer. Máx 8 MB cada.
        </p>
      </div>
      <div className="sm:col-span-2">
        {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
        {success ? <p className="mb-2 text-sm text-pos">{success}</p> : null}
        <button
          type="submit"
          disabled={pending || !clientId || prompt.trim().length < 5}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent/80 disabled:opacity-50"
        >
          {pending ? 'Gerando imagem…' : '✦ Gerar criativo com IA'}
        </button>
      </div>
    </form>
  );
}
