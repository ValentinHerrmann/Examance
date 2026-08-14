import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

/**
 * ESLint flat config (ESLint 9).
 *
 * `npm run lint` has been part of CI since the workflow was written, but no
 * config ever existed, so `eslint .` failed at startup and the step never
 * linted anything. This is the first real configuration for the project.
 *
 * It deliberately enables the correctness-oriented recommended sets and leaves
 * stylistic rules off. A first lint config that lands green and can be tightened
 * later is worth more than an exhaustive one that gets disabled a week after
 * merge. Rules switched off below are annotated with why.
 */
export default [
  {
    ignores: [
      'build/',
      '.svelte-kit/',
      'node_modules/',
      'static/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      '*.timestamp-*.mjs',
      'test-busytex.js',
    ],
  },

  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  {
    rules: {
      // The codebase uses `any` deliberately in a few places where it bridges
      // untyped third-party surfaces (argon2-browser, busytex, pdf.js). Type
      // safety is enforced by `svelte-check`, which runs in the same CI job and
      // is currently at zero errors; duplicating it here as an error would add
      // noise without adding coverage.
      '@typescript-eslint/no-explicit-any': 'off',

      // Caught by svelte-check with full type information, which is more
      // accurate than ESLint's view of Svelte component scope.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // TypeScript resolves identifiers itself, and ESLint's scope analysis
      // does not know DOM *types* — it reports `BlobPart` and friends as
      // undefined globals. Disabling this for typed code is typescript-eslint's
      // own documented recommendation.
      'no-undef': 'off',

      // `catch {}` is used deliberately for best-effort cleanup (terminating an
      // already-dead worker, optional loads). Empty blocks elsewhere still fail.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Reports the Svelte compiler's own warnings. `svelte-check` already
      // surfaces exactly these in the same CI job and is the better tool for
      // them, so they are warnings here rather than a second failing gate.
      'svelte/valid-compile': 'warn',
    },
  },

  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
    rules: {
      // @typescript-eslint/no-unused-vars crashes on the AST that
      // svelte-eslint-parser produces (TypeError in getDefinedMessageData).
      // svelte-check already reports unused bindings in components, with full
      // type information, so nothing is lost by turning it off here.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    files: ['tests/**', 'scripts/**'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Build/tooling scripts are plain JS and not part of the typed source
      // tree; `@ts-nocheck` there is intentional.
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
];
