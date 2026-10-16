import { compile } from 'svelte/compiler'
import ts from 'typescript'
import { readFileSync, readdirSync } from 'fs'
const dir = process.argv[2]
let bad = 0
for (const f of readdirSync(dir).filter((f) => f.endsWith('.svelte'))) {
  const src = readFileSync(dir + '/' + f, 'utf8').replace(/<script lang="ts">([\s\S]*?)<\/script>/, (_, code) =>
    '<script>' + ts.transpileModule(code, { compilerOptions: { target: 99, module: 99, verbatimModuleSyntax: true } }).outputText + '</script>')
  try { const r = compile(src, { filename: f }); for (const w of r.warnings) console.log(f, w.code, w.message.split('\n')[0]) } catch (e) { bad++; console.log(f, e.message) }
}
console.log('errors', bad)
