import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

// Correctness-oriented recommended sets, stylistic rules off. Every rule switched off is annotated.
export default [
  {
    ignores: [
      'build/',
      '.svelte-kit/',
      'node_modules/',
      'static/',
      '.busytex/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      '*.timestamp-*.mjs',
      'test-busytex.js',
    ],
  },

  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  {
    rules: {
      // Deliberate at untyped third-party boundaries (argon2-browser, busytex, pdf.js); svelte-check covers types.
      '@typescript-eslint/no-explicit-any': 'off',

      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // TypeScript resolves identifiers itself; ESLint's scope analysis misreports DOM types (typescript-eslint's advice).
      'no-undef': 'off',

      // `catch {}` is used for best-effort cleanup.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // svelte-check already reports the compiler's warnings in the same CI job.
      'svelte/valid-compile': 'warn',

      // Adding keys changes DOM reuse (and duplicate keys throw in Svelte 5); key lists deliberately, not by rule.
      'svelte/require-each-key': 'off',
      // The app is served from `/` with no `paths.base`, so `resolve()` around every route adds nothing.
      'svelte/no-navigation-without-resolve': 'off',
      // Collections in components are `$state.raw` and replaced on change, or plain locals; SvelteMap/Set would alter that.
      'svelte/prefer-svelte-reactivity': 'off',
    },
  },

  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
    rules: {
      // Crashes on svelte-eslint-parser's AST; svelte-check reports unused bindings in components.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    files: ['tests/**', 'scripts/**'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Tooling scripts are plain JS outside the typed tree; `@ts-nocheck` there is intentional.
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
];
