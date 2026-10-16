// Same setup as the tracker seed; run from the repo root:
//   dev/import-tool/node_modules/.bin/jest -c dev/servone-demo-seed/jest.config.js
module.exports = { ...require('../servone-tracker-import/jest.config.js'), rootDir: __dirname }
