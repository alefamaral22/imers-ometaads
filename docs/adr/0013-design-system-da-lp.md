# ADR 0013 — Design system da LP por tokens (Theme) e seções fechadas

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 8

## Contexto

As LPs precisam ser visualmente consistentes e personalizáveis por cliente, mas geradas/editadas por
IA a partir de dados não confiáveis. Texto e tokens de tema vêm de conteúdo gerado (injeção = dado,
não código). Precisamos limitar o que a IA pode produzir, mantendo qualidade e segurança.

## Decisão

O visual é parametrizado por um **Theme tipado** (cores hex, fontes, raio, largura) validado por Zod e
serializado para **CSS custom properties** (`theme.css`) por `themeToCss`. O charset de cada token é
restrito por regex (hex/`font-family`/CSS length) para que o `theme.css` **não possa injetar CSS
arbitrário**. O catálogo de conteúdo é um conjunto **fechado de 17 seções**, cada uma com schema Zod
estrito para seus `fields`. O `_template` consome os tokens via variáveis CSS e renderiza cada seção
por um componente dedicado.

## Consequências

- **Positivas:** consistência garantida; superfície de injeção fechada (tokens e seções validados);
  trocar o tema é trocar variáveis CSS.
- **Negativas / trade-offs:** novas seções/efeitos exigem mudança de código (schema + renderer);
  expressividade limitada de propósito.
- **Riscos & mitigação:** conteúdo malicioso em copy → bounded length + escape no render (texto, nunca
  `dangerouslySetInnerHTML`).

## Alternativas consideradas

- **CSS/HTML livre gerado pela IA** — rejeitado: injeção e inconsistência incontroláveis.
- **Tema por classes utilitárias hard-coded** — rejeitado: não personaliza por cliente sem rebuild do
  design system.
