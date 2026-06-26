# Product

## Register

product

## Users

O **operador humano** de uma agência de tráfego Meta Ads **operada 24/7 por IAs** (agentes headless +
copiloto de voz Nexus). Ele supervisiona, não executa: entra no dashboard para ver o estado das
campanhas, conversar com o Nexus (voz/texto) e aprovar ações. Contexto de uso: sala/escritório,
monitor grande, sessões de monitoramento ao vivo + conferências rápidas. Secundariamente, **clientes
da agência** (multi-tenant) veem só os próprios dados.

## Product Purpose

Centro de comando de uma agência autônoma: mostrar, em tempo real, o que os agentes estão fazendo,
como as campanhas performam (gasto, funil, ROAS, WhatsApp) e dar ao operador um copiloto que analisa,
cria e ajusta campanhas sob confirmação. Sucesso = o operador confia no sistema num olhar — entende o
estado, vê os agentes trabalhando e age com segurança — sem precisar abrir o Gerenciador da Meta.

## Brand Personality

**Comando, vivo, preciso.** Estética **HUD Jarvis / Homem de Ferro**: a interface parece um centro de
operações sci-fi onde o sistema está vivo — o arc reactor pulsa, dados fluem, agentes acendem quando
trabalham. Tom: confiante, técnico, cinematográfico. Emoção-alvo: a sensação de pilotar algo poderoso
e sob controle. Movimento é parte da identidade (intenso, mas com propósito), não enfeite.

## Anti-references

- **SaaS genérico de template** — cards idênticos repetidos, hero com número gigante, cara de tema
  pronto / "feito por IA".
- **Glassmorphism decorativo em excesso** — vidro fosco/blur sem propósito.
- **Claro/corporativo sem graça** — fundo branco, azul corporativo, visual de planilha.
- **Neon poluído** — cores neon brigando entre si, cansativo de olhar. (O ciano é o herói; os demais
  tons são sinais semânticos, não decoração.)

## Design Principles

1. **O sistema parece vivo.** Estado e atividade são mostrados por movimento com significado (reactor
   aquece quando há agente; dados ao vivo respiram), nunca por animação genérica de entrada.
2. **Densidade com hierarquia.** É um HUD denso de dados — mas cada tela tem UM foco claro; o resto
   recua. Sem mar de cards iguais.
3. **Ciano é semântico, não decorativo.** O glow guia o olho para o que importa (foco, ação, ao vivo);
   tons (warn/danger/pos) carregam significado, não estética.
4. **Cinema legível.** Efeito máximo sem sacrificar leitura: contraste AA e `prefers-reduced-motion`
   são piso, não opção.
5. **Confiança pela precisão.** Números reais, alinhados, em centavos/inteiros; estados vazios honestos
   ("ainda sem dado") em vez de placeholders falsos.

## Accessibility & Inclusion

WCAG **AA** para texto (corpo ≥ 4.5:1, grande ≥ 3:1), inclusive placeholders. Toda animação tem
alternativa em `@media (prefers-reduced-motion: reduce)` (crossfade/estático). Sinais de estado nunca
dependem só de cor (acompanham rótulo/ícone/forma). Foco visível em todo elemento interativo.
