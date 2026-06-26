# Design

Sistema visual **Neural Core** — dark HUD ciano, estética Jarvis. Tokens via Tailwind v4 `@theme`
(`web/app/globals.css`). Identidade preservada; esta é a fonte da verdade visual.

## Theme

Dark-only (`color-scheme: dark`). Cena: operador num centro de comando, luz ambiente baixa, monitor
grande, foco prolongado — escuro profundo reduz fadiga e faz o ciano "acender". Estratégia de cor:
**committed dark** — o quase-preto domina a superfície; um único herói ciano carrega energia e foco;
tons semânticos aparecem só como sinal.

## Color

| Papel | Token | Hex | Uso |
|---|---|---|---|
| Fundo | `bg` | `#04070f` | base quase-preta azulada |
| Painel | `panel` / `panel-2` | `#0a1322` / `#0c1c30` | superfícies elevadas |
| Borda | `edge` | `#173a55` | divisores, contornos |
| **Herói** | `accent` | `#38e6ff` | ciano — foco, ao vivo, ação, glow |
| Acento 2 | `accent-2` | `#2a9fff` | azul de apoio, gradientes |
| Positivo | `pos` | `#00e5a0` | sucesso, ROAS bom, ativo |
| Atenção | `warn` | `#ffb547` | pausado, alerta |
| Roxo | `purple` | `#9d7bff` | métrica terciária (CPM) |
| Perigo | `danger` | `#ff4d6d` | erro, gravação |
| Tinta | `ink` | `#d8f0fa` | texto principal (≈ 13:1 sobre bg) |
| Dim | `dim` | `#5b89a8` | texto secundário — **nunca para corpo longo** (usar `ink/80`+) |

Regra de contraste: corpo ≥ 4.5:1. `dim` (#5b89a8) sobre `bg` ≈ 5.2:1 → ok para rótulos curtos, não
para parágrafos. Tons semânticos sempre com rótulo/ícone junto (não só cor).

## Typography

- **Mono** (`--font-mono`, JetBrains Mono/system) — corpo, dados, rótulos. Reforça o tom técnico/HUD.
- **Display** (`--font-display`) — headings grandes; pareada por contraste com a mono.
- Eyebrows tracked-uppercase são parte da linguagem HUD — mas **com parcimônia** (rótulo de painel, não
  enfeite em toda seção). `text-glow` só no elemento de foco.
- Heading ceiling clamp ≤ 6rem; letter-spacing ≥ -0.04em; `text-wrap: balance` em h1–h3.

## Motion

Identidade **cinematográfica intensa, com propósito** (Framer Motion `motion` + CSS).
- Easings: `--ease-out-quint` / `--ease-out-expo` (sem bounce/elastic).
- Durações: micro 120–200ms; entrada 300–500ms; ambiente (reactor/respiração) 1.6–3.2s.
- **Significado**: reactor/ondas/barras aceleram quando há agente ativo ou Nexus falando; estado vazio
  é calmo. Stagger em listas é ok; reflexo uniforme em tudo, não.
- `@media (prefers-reduced-motion: reduce)` desliga loops e troca reveals por crossfade.
- Materiais premium permitidos com propósito: glow, blur/backdrop, clip-path, mask, scanlines.

## Components

- **Painéis** (`.panel-glow` + `border-edge/60` + `bg-panel/70`): superfície padrão; halo sutil + scan
  no topo no foco. Evitar card idêntico repetido — variar peso/tamanho conforme importância.
- **Stat/KPI**: leitura de dado densa; agrupar por significado, não em grade uniforme infinita.
- **Reactor** (`.reactor`): selo vivo do sistema, do widget ao console.
- **Z-index** semântico (escala em globals.css): base < grid < sticky < overlay < modal < toast.

## Bans (impeccable)

Sem gradient-text, sem side-stripe borders, sem hero-metric template SaaS, sem grade de cards
idênticos, sem eyebrow em toda seção, sem glassmorphism decorativo por default.
