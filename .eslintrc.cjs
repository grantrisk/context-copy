/**
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
    // Configure how ESLint finds the files it should process
    ignorePatterns: ['node_modules/', 'dist/', 'build/', 'coverage/'], // We use an explicit CJS file, so we must define the root
    root: true,
    env: {
        node: true, // Node.js environment
        es2022: true, // ECMAScript 2022 features
    }, // Using a standard parser and recommended rulesets
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module', // Project uses ES modules
    },
    plugins: ['import', 'node', 'promise'],
    extends: [
        'eslint:recommended',
        'plugin:import/recommended',
        'plugin:node/recommended',
        'plugin:promise/recommended', // Must be last to override other configs for style rules
        'prettier',
    ],
    rules: {
        // --- General JS/Best Practices ---
        'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
        'prefer-const': 'error',
        'no-unused-vars': [
            'error',
            { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'linebreak-style': ['error', 'unix'], // --- Node.js & ES Module Specific ---
        // Disable for ES Modules in a CLI context
        'node/no-unsupported-features/es-syntax': 'off', // index.js uses __filename and __dirname as a workaround for ES modules in older Node versions
        'node/no-deprecated-api': 'off',
        'node/no-extraneous-import': [
            'error',
            {
                allowModules: [
                    'commander',
                    'clipboardy',
                    'chalk',
                    'glob',
                    'ignore',
                    'prettier',
                    'tiktoken',
                    'tsconfig-paths',
                ],
            },
        ],
        'import/no-unresolved': [
            'error',
            { commonjs: true, caseSensitive: true },
        ], // Allow named exports
        'import/prefer-default-export': 'off', // --- Async/Promise ---
        'promise/always-return': 'warn',
        'promise/catch-or-return': 'error',
    },
}
