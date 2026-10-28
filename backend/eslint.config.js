const js = require('@eslint/js');
const globals = require('globals');
const stylistic = require('@stylistic/eslint-plugin');
const { defineConfig, globalIgnores } = require('eslint/config');

module.exports = defineConfig([
    // Legacy code. It is deleted in B2-B6, so formatting it is wasted work.
    globalIgnores(['node_modules', 'routes/**', 'services/**']),
    {
        files: ['**/*.js'],
        extends: [js.configs.recommended],
        plugins: { '@stylistic': stylistic },
        languageOptions: {
            sourceType: 'commonjs',
            globals: globals.node,
        },
        rules: {
            '@stylistic/indent': ['error', 4],
            '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/comma-dangle': ['error', 'always-multiline'],
            '@stylistic/space-infix-ops': 'error',
        },
    },
]);
