# Voice Visualizer — anatomia visual do orbe do Nexus

> Análise do efeito "HUD / núcleo de energia" do print de referência (`/operacao`), camada por
> camada. Este documento descreve **o que se vê**; a tecnologia e a arquitetura ficam no
> [`jarvis-visual-system.md`](./jarvis-visual-system.md). Base atual no código: `ArcReactor`
> (`web/components/ops/arc-reactor.tsx`) e `SpeakingOrb` (`web/components/nexus/speaking-orb.tsx`).

## Como ler isto

Pense no efeito como uma **cebola de luz**: várias camadas transparentes empilhadas, do fundo para a
frente. Cada uma faz uma coisa só. Juntas dão a sensação de "instrumento vivo" estilo Jarvis. Listo de
fora para dentro.

## Camadas (de fora para dentro)

1. **Halo de fundo (respiração)**
   Um borrão circular ciano bem suave atrás de tudo, sobre fundo quase preto (`#05080d`-ish). Não tem
   forma definida — é só "brilho no ar". Ele cresce e encolhe devagar, como uma respiração. É o que dá
   o clima de profundidade. *Já existe.*

2. **Anel externo de instrumento (marcações de grau)**
   Um aro fino com **dezenas de risquinhos** (ticks) ao redor, igual à borda de um relógio ou de um
   radar. Gira muito devagar. Passa a ideia de "equipamento de precisão". *Já existe (96 ticks).*

3. **Anel de marcação grossa + círculo tracejado de escaneamento**
   Um segundo anel, mais para dentro, com **marcações maiores a cada 30°** e um **círculo pontilhado**
   (`dash`) que parece estar "varrendo". Gira no sentido contrário ao anel externo — esse contraste de
   rotação é o que faz parecer máquina de verdade. *Já existe.*

4. **Blips no anel do meio** *(a refinar)*
   Pequenos pontos de luz distribuídos em intervalo regular sobre um dos anéis, como contatos num
   radar. No print aparecem como marcadores discretos. Hoje temos os ticks; vamos adicionar **blips**
   (pontinhos com leve glow) que acendem/apagam em sequência.

5. **Varredura de radar (sweep)**
   Uma "fatia de pizza" de luz que dá voltas, iluminando o anel por onde passa — o feixe clássico de
   radar. *Já existe (gradiente cônico mascarado em anel).*

6. **Bobinas do reator (coils)**
   Logo em volta do centro, uns **trapézios radiais** com folga entre eles, formando a "coroa" do
   reator (a assinatura visual do arc reactor do Homem de Ferro). *Já existe (9 coils).*

7. **Núcleo — esfera branco-azulada**
   O coração: uma bola de luz que vai de **branco quente no centro** para **ciano** nas bordas, com
   bloom (brilho que vaza). Pulsa de leve em repouso e forte quando há áudio. *Já existe.*

8. **Rede de constelação / neurônios dentro do núcleo** *(NOVO — peça que falta)*
   Dentro da esfera, uma **teia de pontos ligados por linhas finas**, como uma constelação ou uma rede
   de neurônios. Os pontos flutuam de leve e as linhas que os ligam acendem em ondas. É isto que dá a
   sensação de "tem uma mente pensando aí dentro". **Não existe hoje** e é o principal a construir.

9. **Detalhe icônico interno (triângulo)**
   No miolo, um triângulo fino — citação direta ao núcleo do arc reactor. *Já existe.*

## Paleta e clima

- Fundo: quase preto, levemente azulado.
- Acento: ciano elétrico `#38e6ff`, com azul `#2a9fff` nas transições e **branco** no ponto mais quente
  do núcleo.
- **Glow é regra, não exceção**: quase toda linha clara tem brilho (blur por trás). É o que separa
  "HUD futurista" de "desenho chapado".

## Comportamento (estados)

O orbe tem três estados de energia, do mais calmo ao mais intenso:

| Estado        | Quando                                  | Sensação visual                                          |
| ------------- | --------------------------------------- | -------------------------------------------------------- |
| `idle`        | parado, sem áudio                       | respira devagar; brilho baixo; rotações lentas           |
| `listening`   | o usuário está falando (microfone)      | núcleo reage ao volume da voz; rede de neurônios agita   |
| `speaking`    | a IA está respondendo por voz (TTS)     | pulso mais forte e rápido; ondas de energia emanando     |

A intensidade **não** é um liga/desliga: ela acompanha **em tempo real** o volume do áudio (ver a parte
de áudio no `jarvis-visual-system.md`). Quanto mais alto o som, maior o glow e a escala do núcleo.

## Duas versões (mesma alma)

- **`lg` (grande)** — tela principal do assistente / `/operacao`. Todas as 9 camadas.
- **`sm` (miniatura)** — embutida no chat, ao lado da mensagem, como indicador de "ouvindo/falando".
  Simplifica: **sem** anel externo de ticks nem sweep de radar (camadas 2, 5 pesam e somem em tamanho
  pequeno); mantém **núcleo + rede de neurônios + 2 anéis de eco**. Mesma lógica de animação e de
  reatividade ao áudio, só muda escala e densidade.

## Acessibilidade e movimento

- Elemento **puramente decorativo** → `aria-hidden` (o leitor de tela ignora; quem narra o estado é o
  texto "Falando…/Ouvindo…" ao lado).
- **`prefers-reduced-motion`**: não some o efeito — troca para um **pulso único e bem mais sutil** (só o
  núcleo respirando suave, sem rotações, sem partículas voando).
```
