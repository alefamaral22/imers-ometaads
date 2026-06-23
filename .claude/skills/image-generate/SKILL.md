---
name: image-generate
description: Gera uma imagem de criativo a partir de um prompt (OpenAI gpt-image), faz upload ao bucket público ad-ingest do Supabase Storage e registra a linha em generated_images. Idempotente por storage_path.
allowed-tools: Read, Write, Bash(npx tsx:*), Bash(curl:*)
---

# image-generate

Skill **headless** que produz um criativo de imagem e o disponibiliza para a Meta buscar do bucket
**público** `ad-ingest` (SPEC §10 / ADR 0003). A Meta recebe a imagem por URL pública em
`link_data.picture`.

## Pré-condições

- Env: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Aborte se faltar.

## Invariante de falha (NUNCA placeholder)

A imagem é gasto real de mídia: precisa ser uma imagem **de verdade** do `gpt-image-1`. É **proibido**
gerar/registrar qualquer tampão (PNG de cor sólida, imagem improvisada, `model='placeholder'`,
`cost_usd_estimate=0`). Se a chamada à OpenAI falhar, **falhe em voz alta** (saia com erro / marque
`failed` no manifest da campanha) — **jamais** substitua por placeholder pra "seguir o fluxo".
Sinal de regressão: arquivo no bucket com poucos KB, ou linha em `generated_images` com
`model<>'gpt-image-1'`.

## Entrada

- `prompt` (string), `aspect` (`1:1` default), `storagePath` (determinístico, ex.:
  `cliente-exemplo/curso-exemplo/authority-<stamp>.png`). O `storagePath` é a **chave natural** →
  idempotência.

## Passos

1. **Existe?** GET no Storage; se o objeto em `ad-ingest/<storagePath>` já existe **e** a linha em
   `generated_images` tem `model='gpt-image-1'`, **reusa** (não regenera nem gasta) e segue para o
   passo 4. Se existir mas for tampão (placeholder/poucos KB), trate como inexistente e regenere
   (upload com `x-upsert: true`).
2. **Gera + sobe via Node** (não monte `curl` à mão — o aninhamento de aspas no headless já causou
   `400` e regressão pra placeholder). Node 22 tem `fetch` global. Escreva o `prompt` e o
   `storagePath` em variáveis de ambiente (`PROMPT`, `STORAGE_PATH`) e rode `npx tsx -e`:

   ```ts
   const r = await fetch('https://api.openai.com/v1/images/generations', {
     method: 'POST',
     headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
     body: JSON.stringify({ model: 'gpt-image-1', prompt: process.env.PROMPT, size: '1024x1024', n: 1 }),
   });
   if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 300)}`);
   const b64 = (await r.json())?.data?.[0]?.b64_json;
   if (!b64) throw new Error('no b64_json');
   const bytes = Buffer.from(b64, 'base64');
   if (bytes.length < 20000) throw new Error(`imagem pequena demais (${bytes.length}b) — provável tampão`);
   const url = process.env.SUPABASE_URL.replace(/\/+$/, '');
   const up = await fetch(`${url}/storage/v1/object/ad-ingest/${process.env.STORAGE_PATH}`, {
     method: 'POST',
     headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'image/png', 'x-upsert': 'true' },
     body: bytes,
   });
   if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 300)}`);
   ```

   Se qualquer passo lançar, **aborte** (ver invariante acima) — sem placeholder.

4. **Registra** `generated_images` (upsert idempotente por `storage_bucket`+`storage_path`) via REST,
   usando `upsertRow` (`scripts/onda2/infrastructure/supabase-rest.ts`): `storage_bucket='ad-ingest'`,
   `storage_path`, `width`, `height`, `model='gpt-image-1'`, `prompt`, `aspect`, `cost_usd_estimate`,
   `raw_spec`.

## Saída

`{ storageBucket, storagePath, publicUrl, generatedImageId }`. A `publicUrl` é
`$SUPABASE_URL/storage/v1/object/public/ad-ingest/<storagePath>`. **Nunca** imprima segredos. Sem PII.
