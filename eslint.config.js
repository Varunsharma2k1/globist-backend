// ESLint flat config: recommended rules + a few that catch real bugs.
// Formatting is Prettier's job (eslint-config-prettier turns off clashing rules).
const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  { ignores: ['node_modules/', 'uploads/', 'coverage/', 'docs/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-shadow': 'error', // the bug that once switched off every rate limit
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-return-await': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.js', 'src/seed/**/*.js', 'src/infra/logger.js'],
    rules: { 'no-console': 'off' },
  },
  prettier,
];
