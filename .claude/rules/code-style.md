# Regra: Qualidade & estilo — SPEC §11

Vale em **todas** as ondas.

## Código

- **TypeScript estrito**, sem `any` injustificado (`noUncheckedIndexedAccess`, `strict`).
- **Código e identificadores em inglês**; comentários explicam o "porquê", não o "o quê".
- **Separation of concerns**; dependências apontam pra dentro: `presentation → application → domain`;
  `infrastructure` implementa interfaces do domínio. Boundaries entre contextos via interface pública.
- **Edits mínimos**: mude só o necessário; evite refactor oportunista no mesmo commit.
- Formatação por Prettier (`npm run format`); lint por ESLint flat config.

## Git

- **Conventional Commits**, **um commit atômico por onda** (ou por mudança coesa).
- Sem segredos no diff (verificado por gitleaks no CI — Onda 11).

## Docs as Code (Diátaxis)

- **Spec por feature antes do código** (`docs/specs/`).
- **ADR (Nygard) por decisão estrutural** (`docs/adr/NNNN-titulo.md`).
- **API-first**: contrato antes do handler.
- Estrutura `docs/`: `tutorials/`, `how-to/`, `reference/`, `explanation/` + `adr/`, `specs/`,
  `security/threats/`, `templates/`.
