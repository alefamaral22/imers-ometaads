# Documentação (Diátaxis)

Estrutura orientada por [Diátaxis](https://diataxis.fr/) + ADRs (Nygard) + specs por feature.

| Pasta | O quê | Quando escrever |
|---|---|---|
| `tutorials/` | Aprendizado guiado, do zero | Onboarding de novos builders |
| `how-to/` | Receitas para uma tarefa | "Como preencher credenciais", "Como deployar o runner" |
| `reference/` | Descrição técnica seca | Contratos de scripts, schema, env |
| `explanation/` | Contexto e porquês | Decisões de arquitetura discursivas |
| `adr/` | Decisões estruturais (Nygard) | **Toda** decisão de arquitetura — ver `templates/adr-template.md` |
| `specs/` | Spec por feature | **Antes** de implementar uma feature/onda |
| `security/threats/` | Threat models STRIDE | Por superfície nova (SPEC §11) |
| `templates/` | Modelos reutilizáveis | ADR, spec, threat model |

## Convenções

- **ADR**: `adr/NNNN-titulo-em-kebab.md`, numeração crescente. Status: Proposed/Accepted/Superseded.
- **Spec**: `specs/<feature>.md`, escrita antes do código da onda correspondente.
- Mapa onda → ADRs/specs detalhados está no `SPEC-000-build-from-scratch.md` §13.
