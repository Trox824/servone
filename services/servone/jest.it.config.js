module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__it__/**/*.it.ts'],
  roots: ["./src"],
  moduleNameMapper: { '^@servone/mail$': '<rootDir>/../../packages/servone-mail/src' },
  testTimeout: 60000
}
