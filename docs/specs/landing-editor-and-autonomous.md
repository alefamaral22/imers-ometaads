# SPEC — Editor de landing + modo autônomo do Nexus (Onda 9) + skills create/publish (cont. Onda 8)

- **Onda:** 9 (+ continuação da Onda 8)
- **Status:** Ready

## Objetivo

(1) **Continuação da Onda 8:** gerar e publicar landing pages — skills `create-landing-page-<cliente>`
(rascunho no Supabase + enfileira publish) e `publish-landing-page-<cliente>` (serializa do banco →
`next build` → wrangler deploy). (2) **Onda 9:** editar a LP pelo dashboard (edição síncrona de rascunho)
e deixar o Nexus **acompanhar/narrar** tarefas longas sozinho.

## Entregáveis

- **Onda 8 cont.:** `scripts/onda8/` (invariantes do rascunho + linhas de persistência + plano de
  publicação; 12 testes); subagents `landing-page-architect`, `lp-copywriter`; skills
  `create-landing-page-cliente-exemplo`, `publish-landing-page-cliente-exemplo`.
- **Onda 9 editor (web):** `lib/landing/edit.ts` (edit-path, reconcile por versão, schemas Zod; 5
  testes); serviços `landing-sections`/`watches`; API `POST /api/landing/{section,autonomous}`;
  componente `components/landing/section-editor` + rota `app/landing-pages/[id]`.
- **Onda 9 autônomo (runner):** `scripts/onda9/` (máquina de fases + plano de tick; 8 testes);
  `scripts/runner/{infrastructure/watches.ts,poll-watch-once.ts}`; skill `autonomous-watch-tick`;
  `scripts/poll-autonomous-watches.sh`; `scripts/screenshot-page.cjs` (SSRF-guard),
  `scripts/send-email.cjs` (Resend). Cron no `crontab`. ADRs 0019/0020.

## Contratos

- **Create LP:** conteúdo no banco (`landing_pages.settings/theme` + `landing_page_sections.fields`);
  nasce `noindex=true`/`draft`; valida pelos schemas de `@template/lp-render`; enfileira `landing_publish`.
- **Publish:** serializa **do banco** (`assembleContentDoc`) → CLI do serializer → `next build` →
  wrangler Pages deploy `<subdomain>.example.com`; patcha `status='deployed'`. Go-live indexável é manual.
- **Editor:** edição **síncrona** de rascunho; **concorrência otimista** por `version` (`reconcile`);
  `edit-path` aplica alteração pontual num campo (anti prototype-pollution); validação por schema na
  fronteira. Publish é o job pesado (não o editor).
- **Autônomo:** máquina `watching→reviewing→notifying→done`; **≤1 narração por tick**; idempotente por
  cursores; cron + `claim_autonomous_watch`. Notificação fail-safe (degrada para log).

## Segurança

- Edição: ordem auth → authz → validação (Zod) → lógica; `edit-path` rejeita `__proto__`/`constructor`.
- Autônomo: decisão determinística (testada), sem laço solto; idempotência por cursores.
- Live review: screenshot só de `*.example.com` (SSRF-guard); email fail-safe.
- Sem PII em `nexus_narrations`/manifest. Threat model: `docs/security/threats/landing-page-editor.md`.

## Critérios de aceite

- [ ] `create-landing-page` grava rascunho (noindex) + job `landing_publish`; `publish` builda e publica
      em preview e patcha `deployed`.
- [ ] Editar um campo no dashboard atualiza `landing_page_sections` (versão incrementa; conflito → 409).
- [ ] Iniciar modo autônomo cria `autonomous_watches`; cada tick insere ≤1 `nexus_narrations` e avança
      a fase; repetir o tick não duplica.
- [ ] `lint` + `typecheck` + `test` + `next build` verdes.
