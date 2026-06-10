module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  rules: {
    // This codebase doesn't use PropTypes.
    'react/prop-types': 'off',
    // Vite Fast Refresh: components should be the only export from a module.
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Allow intentionally-unused args (e.g. event handlers) prefixed with _.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Empty catch blocks are used deliberately to swallow non-critical errors.
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
}
