import sonarjs from 'eslint-plugin-sonarjs';
import base from './eslint.config.js';

// Local stand-in for SonarCloud (`make sonar-check`): only changed files are passed in, so old code does not drown new findings; CI keeps eslint.config.js.
export default [
  ...base,
  sonarjs.configs.recommended,
  {
    // Type-aware sonarjs rules (e.g. S2871, a bare sort) stay silent without type information.
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname, extraFileExtensions: ['.svelte'] },
    },
    rules: {
      // typescript-eslint already reports these and honours the `_` prefix for deliberately unused names.
      'sonarjs/no-unused-vars': 'off',
    },
  },
];
