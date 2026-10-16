module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  roots: ['./src'],
  // No rush install has linked @servone/approvals here yet; resolve straight to source.
  moduleNameMapper: {
    '^@servone/approvals/(.*)$': '<rootDir>/../servone-approvals/$1'
  },
  coverageReporters: ['text-summary', 'html'],
  // Every workspace replays the full models/all transaction list.
  testTimeout: 60000
}
