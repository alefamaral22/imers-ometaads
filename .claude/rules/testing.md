# Regra: Testes — SPEC §11

Vale em **todas** as ondas.

## Pirâmide

- **Muito unit** — toda lógica de `domain/` e `application/` é testada (puro, sem I/O).
- **Médio integração** — onde há I/O (DB, REST, MCP, storage), com dependências reais ou fakes fiéis.
- **Pouco e2e** — fluxos críticos selecionados (login, job→runner→completed, criar campanha PAUSED).

## Disciplina

- **Bug fix começa por um teste que reproduz** o bug (red → green).
- Runner Vitest: `npm run test`. Cobertura mínima exigida em `domain/` e `application/` (Onda 11).
- Testes determinísticos: sem rede real em unit; relógio/UUID/rng injetáveis.
- Nomes: `*.test.ts` / `*.spec.ts`, colocados ao lado do código ou em `__tests__/`.

## Critérios de aceite por onda

Cada onda só fecha com `lint` + `typecheck` + `test` verdes e os critérios de aceite específicos
da onda (ver SPEC §8) satisfeitos.
