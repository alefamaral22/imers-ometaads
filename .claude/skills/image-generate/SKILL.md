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

## Entrada

- `prompt` (string), `aspect` (`1:1` default), `storagePath` (determinístico, ex.:
  `cliente-exemplo/curso-exemplo/authority-<stamp>.png`). O `storagePath` é a **chave natural** →
  idempotência.

## Passos

1. **Existe?** GET no Storage; se o objeto em `ad-ingest/<storagePath>` já existe, **reusa** (não
   regenera nem gasta) e segue para o passo 4.
2. **Gera** a imagem via OpenAI Images API (modelo `gpt-image-1`), tamanho conforme `aspect`.
3. **Upload** ao Storage (bucket público `ad-ingest`):

   ```bash
   curl -sS -X POST "$SUPABASE_URL/storage/v1/object/ad-ingest/$STORAGE_PATH" \
     -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
     -H "Content-Type: image/png" --data-binary "@$LOCAL_FILE"
   ```

4. **Registra** `generated_images` (upsert idempotente por `storage_bucket`+`storage_path`) via REST,
   usando `upsertRow` (`scripts/onda2/infrastructure/supabase-rest.ts`): `storage_bucket='ad-ingest'`,
   `storage_path`, `width`, `height`, `model='gpt-image-1'`, `prompt`, `aspect`, `cost_usd_estimate`,
   `raw_spec`.

## Saída

`{ storageBucket, storagePath, publicUrl, generatedImageId }`. A `publicUrl` é
`$SUPABASE_URL/storage/v1/object/public/ad-ingest/<storagePath>`. **Nunca** imprima segredos. Sem PII.
