# ADR 0020 — Live review: screenshot com SSRF-guard + notificação fail-safe

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 9

## Contexto

Na fase `reviewing` do modo autônomo, o Nexus pode "olhar" a página publicada (preview) para opinar, e
na fase `notifying` avisar o operador por email. Tirar screenshot de uma URL e enviar email são duas
superfícies sensíveis: a captura pode ser usada para **SSRF** (pedir para o screenshotter buscar
`http://169.254.169.254/` ou uma intranet), e a notificação não pode derrubar o fluxo se o provedor
falhar.

## Decisão

- **Screenshot (`scripts/screenshot-page.cjs`, Playwright):** SSRF-guard estrito — só captura `https`
  para um host que seja `example.com` ou `*.example.com` (o domínio das LPs em preview). Qualquer outro
  host/protocolo é recusado (exit ≠ 0). Playwright é opcional: sem ele, degrada com erro claro.
- **Email (`scripts/send-email.cjs`, Resend):** **fail-safe** — sem `RESEND_API_KEY`/destinatário,
  degrada para **log-only** e sai 0; mesmo em erro do provedor, loga e não propaga. A notificação nunca
  derruba o tick autônomo.

A decisão de QUANDO revisar/notificar é da máquina de fases (ADR 0019); estes scripts são as ações de
borda, isoladas e com guardas próprias.

## Consequências

- **Positivas:** SSRF fechado por allowlist de sufixo de domínio; notificação não vira ponto único de
  falha; capturas só de páginas próprias (preview).
- **Negativas / trade-offs:** o SSRF-guard fixa `*.example.com` (placeholder do template) — ao
  personalizar o domínio, ajustar `SCREENSHOT_ALLOWED_SUFFIX`.
- **Riscos & mitigação:** redirecionamento da página para um host interno → Playwright segue o host
  inicial validado; a captura é de preview público (sem credenciais de sessão).

## Alternativas consideradas

- **Screenshot de qualquer URL** — rejeitado: SSRF clássico.
- **Falhar o tick quando o email falha** — rejeitado: a notificação é um efeito colateral, não o
  núcleo; degradar para log preserva o acompanhamento.
