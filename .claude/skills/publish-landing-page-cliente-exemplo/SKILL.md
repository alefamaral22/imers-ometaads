---
name: publish-landing-page-cliente-exemplo
description: Publica uma landing page do cliente-exemplo em preview — serializa o ContentDoc do banco (@template/lp-render) para o template, roda next build (static export) e faz wrangler deploy no Cloudflare Pages em <subdomain>.example.com. Patcha landing_pages (deployed). Headless e idempotente.
allowed-tools: Read, Write, Glob, Bash(npx tsx:*), Bash(bash scripts/publish-lp.sh:*), Bash(sleep:*), Bash(tail:*), Bash(cat:*), Bash(ls:*)
---

# publish-landing-page-cliente-exemplo

Skill **headless** que **serializa do banco → builda → publica**. Conteúdo vem de `landing_pages` +
`landing_page_sections` (fonte da verdade), não de arquivos. Persistência via **REST +
`SUPABASE_SECRET_KEY`**. Ver ADR 0012 (Cloudflare Pages) e SPEC-011.

## Regras invioláveis

- Publica em **preview** `<subdomain>.example.com`, mantendo **`noindex`** (go-live é manual).
- Serializa **a partir do banco** (não de arquivos soltos): single source of truth.
- Idempotente: re-publicar o mesmo subdomain atualiza o mesmo projeto Pages.
- Segredos (`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`) só via env. Sem PII em logs/manifest.

## Pré-condições

- Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
  Args: `SUBDOMAIN` (ou `LANDING_PAGE_ID`). Aborte se faltar.

## Fluxo

1. **Ler a LP + seções** via `selectRows` (`scripts/onda2/infrastructure/supabase-rest.ts`):
   `landing_pages?subdomain=eq.<SUBDOMAIN>&select=*` e
   `landing_page_sections?landing_page_id=eq.<id>&order=position.asc&select=*`.
2. **Montar o ContentDoc** — `assembleContentDoc(lp, sectionRows)`
   (`scripts/onda8/application/publish-plan.ts`): ordena por position, valida invariantes. Valide
   também com `parseContentDoc` de `@template/lp-render` (deep). Inválido → **aborte**.
3. **Serializar para o template** — escreva `landing-pages/_template/content-doc.json` com o ContentDoc
   e rode o serializer (CLI do pacote):

   ```bash
   npx tsx packages/lp-render/src/serializer/cli.ts \
     --in landing-pages/_template/content-doc.json \
     --out landing-pages/_template/generated
   ```

   (gera `content-spec.json` + `messages/pt.json` + `theme.css`).
4. **Build + deploy (uma chamada bloqueante)** — rode **exatamente**:

   ```bash
   bash scripts/publish-lp.sh <SUBDOMAIN>
   ```

   O script builda o export estático (limpa `.next`/`out`, capa o heap) **e** faz `wrangler pages
   deploy` no Cloudflare Pages, tudo numa execução bloqueante. **AGUARDE o comando RETORNAR** — não o
   lance em segundo plano, não emita nenhuma mensagem nem rode outro comando até ele terminar (o passo
   é lento; se você responder no meio, o loop encerra antes do deploy = falso-verde). Ao final ele
   imprime `PUBLISH_LP_URL=<url>` — **capture essa URL**. Se o comando sair ≠ 0, **aborte** sem patch.
5. **Patch** — `upsertRow('landing_pages', { subdomain, ...publishPatch({url, fqdn, snapshot}) },
   'subdomain')` usando a `url` capturada: `status='deployed'`, `url`, `ssl_status`,
   `published_snapshot`. `operation_logs` (`action='update'`, `actor='skill'`).
6. **Manifest** — `tentativas-geracao-de-campanhas/<stamp>-landing-publish.json` (`buildPublishManifest`).

## Critérios de aceite

Builda o `_template` (`next build` verde) e publica uma página acessível (200) em preview; patcha
`landing_pages` para `deployed` com `url`; re-publicar não duplica projeto; manifest escrito.
