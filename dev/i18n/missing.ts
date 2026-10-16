// Lists strings an MVP screen would show in English to a Vietnamese user.
// Run from packages/servone-ui: npx ts-node --transpile-only ../../dev/i18n/missing.ts [plugin ...]
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { overrides } from '../../packages/servone-ui/src/shell/strings'

const ROOT = join(__dirname, '..', '..')

// Plugins behind the apps in the launch rail (PRODUCT.md Scope at Launch); hidden apps are left out.
const MVP_PLUGINS = [
  'activity', 'attachment', 'calendar', 'chunter', 'contact', 'document', 'drive', 'hr', 'login', 'love',
  'notification', 'onboard', 'presentation', 'process', 'setting', 'tags', 'text-editor', 'time', 'tracker',
  'ui', 'view', 'workbench'
]

// Plugin ids whose assets folder doesn't follow `<id>-assets`.
const LANG_DIRS: Record<string, string> = { ui: 'packages/ui/lang', presentation: 'packages/presentation/lang' }

type Strings = Record<string, string>

function readStrings (dir: string, lang: string): Strings {
  const file = join(ROOT, dir, `${lang}.json`)
  if (!existsSync(file)) return {}
  const parsed: { string?: Strings } = JSON.parse(readFileSync(file, 'utf8'))
  return parsed.string ?? {}
}

// Text with no letters (`{count}`, `—`) reads the same in both languages.
const hasWords = (text: string): boolean => /\p{L}{2,}/u.test(text.replace(/\{[^}]*\}/g, ''))

const plugins = process.argv.length > 2 ? process.argv.slice(2) : MVP_PLUGINS
let total = 0
for (const plugin of plugins) {
  const dir = LANG_DIRS[plugin] ?? `plugins/${plugin}-assets/lang`
  const local = overrides[plugin as keyof typeof overrides] ?? {}
  const en = { ...readStrings(dir, 'en'), ...(local.en ?? {}) }
  const vi = { ...readStrings(dir, 'vi'), ...(local.vi ?? {}) }
  const missing = Object.keys(en).filter((key) => hasWords(en[key]) && (vi[key] === undefined || vi[key] === en[key]))
  if (missing.length === 0) continue
  total += missing.length
  console.log(`\n${plugin} (${missing.length})`)
  for (const key of missing) console.log(`  ${key}${vi[key] === undefined ? '' : ' [same as en]'}: ${en[key]}`)
}
console.log(`\n${total} strings need Vietnamese`)
