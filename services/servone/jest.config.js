module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  roots: ["./src"],
  // Tests read @servone packages from source so nothing has to be compiled first.
  moduleNameMapper: {
    '^@servone/approvals$': '<rootDir>/../../packages/servone-approvals/src',
    '^@servone/approvals/(.*)$': '<rootDir>/../../packages/servone-approvals/$1',
    '^@servone/config$': '<rootDir>/../../packages/servone-config/src',
    '^@servone/forms$': '<rootDir>/../../packages/servone-forms/src',
    '^@servone/mail$': '<rootDir>/../../packages/servone-mail/src',
    '^@servone/notify-rules$': '<rootDir>/../../packages/servone-notify-rules/src'
  },
  coverageReporters: ["text-summary", "html"]
}
