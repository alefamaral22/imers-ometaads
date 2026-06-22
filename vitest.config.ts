import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'venv', 'dist', '.next', 'out'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      // Onda 11: cobertura mínima em domain/ e application/ (a lógica pura do projeto).
      include: ['**/domain/**', '**/application/**'],
      // Gate do CI (npm run test:coverage). Limites abaixo do medido, com folga p/ não ser flaky;
      // sobem conforme a cobertura cresce. Sobe = bom; cair abaixo destes barra o merge.
      thresholds: {
        statements: 55,
        branches: 70,
        functions: 70,
        lines: 55,
      },
    },
  },
});
