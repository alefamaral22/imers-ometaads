# Jarvis Visual System — VoiceOrb (núcleo de energia do Nexus)

> Sistema do visualizador de voz "HUD / núcleo de energia". A **anatomia visual** (camadas, paleta,
> estados) está em [`voice-visualizer-spec.md`](./voice-visualizer-spec.md); aqui ficam a **arquitetura,
> a tecnologia e os contratos** dos componentes.

## Decisão de tecnologia (e o porquê, em uma linha)

**Híbrido:** moldura em **SVG/CSS** (anéis, ticks, sweep, coils — baratos e nítidos em qualquer tamanho)
+ núcleo reativo em **WebGL** (esfera + rede de neurônios + glow, onde partículas e brilho valem a GPU).
WebGL foi a escolha pedida pelo produto para máxima fidelidade; restringimos seu uso ao núcleo e
blindamos a bateria com as guardas abaixo. (Trade-offs completos: ver o histórico desta feature.)

## Componentes

```
web/components/nexus/voice-orb/
  voice-orb.tsx        # <VoiceOrb size state levelRef px? /> — compõe moldura + núcleo + halo/sweep/eco
  orb-rings.tsx        # moldura SVG (motion); detail 'full' | 'min'
  orb-core-webgl.tsx   # núcleo WebGL (1 shader, 1 draw call/frame) + fallback CSS (OrbCoreFallback)
  audio-meter.ts       # medidor Web Audio (mic + TTS) → levelRef 0..1 (sem React)
```

### `<VoiceOrb>` — API pública

| prop       | tipo                                   | papel                                                            |
| ---------- | -------------------------------------- | ---------------------------------------------------------------- |
| `size`     | `'lg' \| 'sm'`                         | `lg`: tela principal (todas as camadas). `sm`: miniatura do chat |
| `state`    | `'idle' \| 'listening' \| 'speaking'`  | "temperatura" da moldura (rotação/brilho)                        |
| `levelRef` | `{ current: number }` (0..1, opcional) | nível de áudio ao vivo; o núcleo lê **por frame** (sem re-render) |
| `px`       | `number` (só `sm`)                     | lado em px da miniatura (padrão 96)                              |

- `size="lg"` → `<VoiceOrb size="lg">` no centro da Operação ao vivo.
- `size="sm"` → no chat (widget de canto e console). Mesma lógica; sem ticks/sweep externos.

## Reatividade ao áudio (fluxo)

```
mic (getUserMedia) ─┐
                    ├─→ AnalyserNode → RMS → normalizeLevel → levelRef.current (0..1, ALVO)
TTS (<audio>)      ─┘                                            │
                                                                 ▼
                                          OrbCoreWebGL: smoothed += (alvo - smoothed) * (sobe rápido /
                                          desce devagar) + respiração de repouso → uniform uLevel
```

- O **medidor** (`audio-meter.ts`) só **normaliza** e escreve o alvo; a **suavização** (attack/decay) e a
  **respiração de repouso** ficam no núcleo, lidas por frame. Nada disso passa por estado do React.
- `use-voice.ts` é o dono do mic e do TTS e aciona o medidor: push-to-talk e mãos-livres (reusa o RMS do
  VAD) para a voz do usuário; o `<audio>` do TTS para a voz da IA. Anti-eco: enquanto a IA fala, o orbe é
  dirigido pelo medidor do TTS (o mic está pausado).
- **TTS nunca é mutado**: só roteamos o `<audio>` pelo Web Audio se `meter.resume()` confirmar o contexto
  tocando; caso contrário o áudio sai pelo caminho normal e o orbe apenas "respira".

## Guardas de performance e acessibilidade

- **Decorativo** → `aria-hidden` em todas as camadas; quem narra estado é o texto "Falando…/Ouvindo…".
- **`prefers-reduced-motion`** → núcleo cai no fallback CSS (`OrbCoreFallback`, pulso único e suave); a
  moldura desliga rotações (loops vazios no `motion`).
- **Sem WebGL** (contexto/shader indisponível) → mesmo fallback CSS, sem quebrar a tela.
- **Trava de FPS** (~30) no loop do núcleo; **DPR ≤ 2** no canvas (não cria buffer gigante no celular).
- **Page Visibility API**: o loop do núcleo pausa quando a aba fica oculta; o medidor suspende o
  AudioContext quando nenhuma fonte está ativa.
```
