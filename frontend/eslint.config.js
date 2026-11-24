import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// Warn, as CRA did. Existing dead code is a separate cleanup.
// Components used only in JSX look unused to core ESLint.
const unusedVars = ['warn', { varsIgnorePattern: '^[A-Z_]' }];

export default defineConfig([
    globalIgnores(['build']),
    {
        files: ['**/*.{js,jsx,mjs,ts,tsx}'],
        plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
        languageOptions: {
            globals: globals.browser,
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        },
    },
    {
        files: ['**/*.{js,jsx,mjs}'],
        extends: [js.configs.recommended],
        rules: { 'no-unused-vars': unusedVars },
    },
    {
        files: ['**/*.{ts,tsx}'],
        extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': unusedVars,
            '@typescript-eslint/no-explicit-any': 'error',
            // Async onClick/onSubmit handlers are normal in React; the returned promise is ignored on purpose.
            '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
        },
    },
    {
        files: ['**/*.test.{js,ts}', 'src/setupTests.{js,ts}'],
        languageOptions: { globals: globals.vitest },
    },
    {
        files: ['vite.config.js', 'postcss.config.js', 'tailwind.config.js', 'eslint.config.js', 'scripts/**'],
        languageOptions: { globals: globals.node },
    },
]);
