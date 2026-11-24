import js from '@eslint/js';
import globals from 'globals';
import nodePlugin from 'eslint-plugin-n';
import security from 'eslint-plugin-security';

export default [
    {
        ignores: ['frontend/**', 'node_modules/**', 'dist/**', 'coverage/**', 'server-bundle.cjs', '.scannerwork/**'],
    },
    js.configs.recommended,
    nodePlugin.configs['flat/recommended-script'],
    security.configs.recommended,
    {
        files: ['**/*.js', '**/*.cjs'],
        languageOptions: {
            sourceType: 'commonjs',
            ecmaVersion: 2024,
            globals: { ...globals.node },
        },
        rules: {
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-unused-vars': ['error', { caughtErrors: 'none', argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'preserve-caught-error': 'error',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'n/no-unpublished-require': 'off',
            'n/no-process-exit': 'off',
            'security/detect-object-injection': 'off',
        },
    },
    {
        files: [
            'src/services/authService.js',
            'src/services/backupService.js',
            'src/services/diagnoseService.js',
            'src/services/scannerService.js',
            'src/services/securityService.js',
            'src/services/zarfService.js',
            'src/routes/orasRoutes.js',
            'src/utils/grypeDbHelper.js',
            'src/utils/oras.js',
        ],
        rules: { 'security/detect-non-literal-fs-filename': 'off' },
    },
    {
        files: ['**/*.mjs'],
        languageOptions: { sourceType: 'module', ecmaVersion: 2024, globals: { ...globals.node } },
        rules: {
            'n/no-unpublished-import': 'off',
            'n/no-process-exit': 'off',
            'security/detect-non-literal-fs-filename': 'off',
        },
    },
    {
        files: ['**/*.test.js'],
        rules: {
            'security/detect-non-literal-fs-filename': 'off',
            'n/no-unsupported-features/node-builtins': 'off',
        },
    },
];
