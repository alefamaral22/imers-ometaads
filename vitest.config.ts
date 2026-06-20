import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'venv', 'dist', '.next', 'out'],
    coverage: {
      provider: 'v8',
      // Onda 11: cobertura mínima em domain/ e application/.
      include: ['**/domain/**', '**/application/**'],
    },
  },
});
