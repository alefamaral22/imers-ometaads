# Threat model STRIDE — Editor de landing + modo autônomo (Onda 9) + publish (cont. Onda 8)

- **Onda:** 9
- **Superfície:** API `POST /api/landing/{section,autonomous}` + rota `app/landing-pages/[id]` (web);
  skills `create/publish-landing-page-*` + `autonomous-watch-tick`; `scripts/onda8|onda9/`;
  `scripts/{screenshot-page.cjs,send-email.cjs}`.
- **Confiança:** endpoints web exigem sessão de operador; skills rodam no runner headless. Entradas:
  edição de campo, brief/estrutura/copy (subagents), URL para screenshot, status de job.

## Ativos

- `SUPABASE_SECRET_KEY`, `CLOUDFLARE_API_TOKEN`, `RESEND_API_KEY` (server-only).
- Integridade de `landing_pages`/`landing_page_sections`/`autonomous_watches`/`nexus_narrations`.
- A rede interna (alvo de SSRF pelo screenshotter).

## STRIDE

### Spoofing
- **Ameaça:** editar/publicar/abrir watch sem sessão.
- **Mitigação:** middleware `/landing/*` faz auth→authz antes de tudo (`401` caso contrário).

### Tampering
- **Ameaça:** edit-path malicioso (`__proto__.x`) poluindo protótipo; brief/copy com injeção.
- **Mitigação:** `applyEditPath` rejeita segmentos `__proto__`/`prototype`/`constructor` e valida o
  charset; brief/estrutura/copy são **dado, não instrução**; o ContentDoc é validado pelos schemas
  strict de `@template/lp-render` no publish.

### Repudiation
- **Ameaça:** edição/publicação sem rastro.
- **Mitigação:** `landing_page_sections.version` (concorrência otimista) + `operation_logs` no publish;
  narrações em `nexus_narrations` (append-only) registram o acompanhamento.

### Information Disclosure
- **Ameaça:** segredo/PII em narração/manifest; captura de página com dados sensíveis.
- **Mitigação:** narrações só carregam status/opinião (sem PII); segredos só em env; a captura é de
  **preview público** (`*.example.com`), sem sessão.

### Denial of Service / custo
- **Ameaça:** edição em loop; watch preso reprocessando; publish caro repetido.
- **Mitigação:** edição é síncrona e barata; watch avança 1 tick/min com fases terminais; publish é
  idempotente (mesmo subdomain → mesmo projeto Pages).

### Elevation of Privilege / SSRF
- **Ameaça:** usar o screenshotter para alcançar a intranet/metadata (SSRF); skill com poder além do
  necessário.
- **Mitigação:** **SSRF-guard** — screenshot só de `https://*.example.com`; least privilege nas
  allowed-tools (editor não publica; tick só lê/patcha watch); persistência só via REST + service key.

## Resíduo aceito

- O SSRF-guard fixa o sufixo do template (`*.example.com`); ao personalizar, ajustar
  `SCREENSHOT_ALLOWED_SUFFIX`.
- Edição de rascunho faz validação rasa (envelope + edit-path); a validação profunda por seção ocorre
  no publish (serializer) — uma LP inválida não publica, mas pode existir como rascunho.
