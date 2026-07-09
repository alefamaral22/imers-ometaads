import 'server-only';
import { selectRows } from '../db/client';
import { apiKeyEncKey } from '../multitenant/enc-keys';
import { decryptSecret, fromPgByteaHex } from '../multitenant/secrets';
import { buildCategoryPrompt } from '../domain/creative-categories';

/**
 * Gera imagem via OpenAI gpt-image-1 (dall-e-3 foi descontinuado nas contas novas — 2026). A chave de
 * API é resolvida da account do chamador (api_keys_clientes.provider = 'openai', cifrada em
 * repouso) — cada cliente usa a SUA chave, não a da agência (CLAUDE.md: tokens por tenant). Lança se
 * a chave não existir ou estiver inválida.
 */

export interface ReferenceImageInput {
  base64: string;
  mimeType: string; // ex.: 'image/png', 'image/jpeg'
}

export interface GenerateImageInput {
  accountId: string;
  prompt: string;
  /** Categoria do nicho (ex.: 'trafego-pago', 'delivery') — injeta diretrizes de design do segmento. */
  categoryId?: string | undefined;
  size?: '1024x1024' | '1536x1024' | '1024x1536' | undefined;
  quality?: 'low' | 'medium' | 'high' | undefined;
  /** Imagens de referência (logo, foto de produto, foto do cliente) para incorporar no flyer. */
  referenceImages?: ReferenceImageInput[] | undefined;
}

export interface GeneratedImage {
  base64: string; // bytes da imagem em base64 (gpt-image-1 não devolve URL, só b64_json)
  revisedPrompt: string;
  model: string;
  width: number;
  height: number;
}

/** Resolve a chave OpenAI decifrada da account (lança se não houver). */
async function resolveOpenAiKey(accountId: string): Promise<string> {
  const rows = await selectRows('api_keys_clientes', {
    select: 'key_cipher,status',
    eq: { account_id: accountId, provider: 'openai' },
    limit: 1,
  });
  const row = rows[0] as { key_cipher?: string; status?: string } | undefined;
  if (!row?.key_cipher) {
    throw new Error(
      'openai_key_missing: Nenhuma chave OpenAI cadastrada para esta conta. ' +
        'Cadastre em Conexões & chaves antes de gerar imagens.',
    );
  }
  if (row.status === 'invalid') {
    throw new Error(
      'openai_key_invalid: A chave OpenAI desta conta está inválida. ' +
        'Rotacione em Conexões & chaves.',
    );
  }
  const key = apiKeyEncKey();
  return decryptSecret(fromPgByteaHex(row.key_cipher), key);
}

function parseDimensions(size: string): { width: number; height: number } {
  const parts = size.split('x').map(Number);
  const w = parts[0] ?? 1024;
  const h = parts[1] ?? 1024;
  return { width: w, height: h };
}

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

async function callOpenAiError(res: Response): Promise<never> {
  const detail = await res.text().catch(() => '');
  if (res.status === 401 || res.status === 403) {
    throw new Error('openai_auth_error: Chave OpenAI sem permissão para gerar imagens.');
  }
  if (res.status === 429) {
    throw new Error('openai_rate_limit: Limite de requisições da OpenAI atingido. Tente em breve.');
  }
  throw new Error(`openai_error: OpenAI ${res.status}: ${detail.slice(0, 500)}`);
}

/**
 * Chama a API de geração de imagens da OpenAI (gpt-image-1). Sem imagens de referência usa
 * /v1/images/generations; com referência(s) usa /v1/images/edits (multipart) para incorporar o
 * conteúdo enviado (logo, foto do produto, foto do cliente) no criativo final.
 */
export async function generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
  const apiKey = await resolveOpenAiKey(input.accountId);
  const size = input.size ?? '1024x1024';
  const quality = input.quality ?? 'medium';

  const finalPrompt = buildCategoryPrompt(input.categoryId ?? '', input.prompt);
  const refs = input.referenceImages ?? [];

  let res: Response;
  if (refs.length > 0) {
    const form = new FormData();
    form.set('model', 'gpt-image-1');
    form.set('prompt', finalPrompt);
    form.set('n', '1');
    form.set('size', size);
    form.set('quality', quality);
    refs.forEach((ref, i) => {
      const bytes = Buffer.from(ref.base64, 'base64');
      const blob = new Blob([bytes], { type: ref.mimeType });
      form.append('image[]', blob, `ref-${i}.${extFromMime(ref.mimeType)}`);
    });
    res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: finalPrompt,
        n: 1,
        size,
        quality,
      }),
    });
  }

  if (!res.ok) await callOpenAiError(res);

  const body = (await res.json()) as {
    data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  };
  const img = body.data[0];
  if (!img?.b64_json) {
    throw new Error('openai_error: resposta inesperada da OpenAI (sem imagem em base64).');
  }

  const dims = parseDimensions(size);
  return {
    base64: img.b64_json,
    revisedPrompt: img.revised_prompt ?? finalPrompt,
    model: 'gpt-image-1',
    width: dims.width,
    height: dims.height,
  };
}
