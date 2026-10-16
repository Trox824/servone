// Svelte 5 and its runtime deps ship ESM-only source, so they go through ts-jest instead of being skipped.
const ESM_DEPS = '(svelte|esm-env|clsx)'

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testEnvironmentOptions: { customExportConditions: ['browser'] },
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  // No rush install in this checkout yet (see constraints.md); resolve straight to source.
  moduleNameMapper: {
    '^@servone/approvals/(.*)$': '<rootDir>/../servone-approvals/$1',
    '^@servone/config$': '<rootDir>/../servone-config/src',
    '^@servone/mail$': '<rootDir>/../servone-mail/src',
    '^@servone/notify-rules$': '<rootDir>/../servone-notify-rules/src'
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    [`/node_modules/${ESM_DEPS}/.+\\.js$`]: ['ts-jest', { tsconfig: { allowJs: true } }]
  },
  transformIgnorePatterns: [
    `/node_modules/(?!(\\.pnpm|${ESM_DEPS})/)`,
    `/node_modules/\\.pnpm/(?!${ESM_DEPS}@)`
  ]
}
