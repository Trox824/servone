// This folder is not a rush project and has no node_modules of its own;
// jest and ts-jest are borrowed from dev/import-tool. Run from the repo root:
//   dev/import-tool/node_modules/.bin/jest -c dev/servone-tracker-import/jest.config.js
const path = require('path')

const importTool = path.join(__dirname, '..', 'import-tool')

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      require.resolve('ts-jest', { paths: [importTool] }),
      {
        // Type-check is off: @types/jest is not resolvable from here.
        diagnostics: false,
        tsconfig: { module: 'commonjs', target: 'es2022', isolatedModules: true, esModuleInterop: true }
      }
    ]
  }
}
