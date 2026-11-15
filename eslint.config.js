import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/dist-pages/**', '**/node_modules/**', 'public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase writes `const x = f()` for its side effects; an unused
      // binding is a real mistake, an unused argument is usually not.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Parsed JSON and jsdom mocks are `any` all over the tests. Reported,
      // but not a build failure — the fix is a typing pass, not a rule change.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-undef': 'off',
    },
  },
)
