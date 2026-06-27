---
name: publish-landing-page-cliente-exemplo
description: Publica uma landing page do cliente-exemplo em preview — serializa o ContentDoc do banco (@template/lp-render) para o template, roda next build (static export) e faz wrangler deploy no Cloudflare Pages em <subdomain>.example.com. Patcha landing_pages (deployed). Headless e idempotente.
allowed-tools: Read, Write, Glob, Bash(npx tsx:*), Bash(npm:*), Bash(npx wrangler:*), Bash(sleep:*), Bash(tail:*), Bash(cat:*), Bash(ls:*)
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
4. **Build estático** — `( cd landing-pages/_template && npm run build:ci )` (Next.js `output:export` →
   `out/`). Rode em **UMA chamada Bash síncrona** e **AGUARDE terminar** — NÃO lance em segundo plano e
   NÃO relance em paralelo se demorar (duas builds simultâneas corrompem o `.next`). O script `build:ci`
   já limpa `.next`/`out` antes e capa o heap do Node (memória do VM); se falhar, **aborte** sem deploy.
   (O runner headless executa comandos longos como tarefa de fundo e faz polling com `sleep`/`tail` —
   por isso eles estão no `allowed-tools`; sem isso o build "compila" mas a skill trava sem confirmar.)
5. **Deploy** — `npx wrangler pages deploy landing-pages/_template/out --project-name
   cliente-exemplo-<subdomain>` (cria/atualiza o projeto Pages; idempotente). Capture a URL.
6. **Patch** — `upsertRow('landing_pages', { subdomain, ...publishPatch({url, fqdn, snapshot}) },
   'subdomain')`: `status='deployed'`, `url`, `ssl_status`, `published_snapshot`. `operation_logs`
   (`action='update'`, `actor='skill'`).
7. **Manifest** — `tentativas-geracao-de-campanhas/<stamp>-landing-publish.json` (`buildPublishManifest`).

## Critérios de aceite

Builda o `_template` (`next build` verde) e publica uma página acessível (200) em preview; patcha
`landing_pages` para `deployed` com `url`; re-publicar não duplica projeto; manifest escrito.
