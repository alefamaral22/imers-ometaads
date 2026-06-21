// ESLint flat config (v9). Base estrita TS + Prettier desliga regras de formatação.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'venv/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/.wrangler/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Scripts auxiliares do runner em CommonJS Node (screenshot/email — Onda 9). Globals do Node.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        console: 'readonly',
        module: 'writable',
        require: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      // require() é o mecanismo correto em CommonJS (e o require lazy de playwright é proposital).
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
);
