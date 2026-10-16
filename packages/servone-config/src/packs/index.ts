import { type Pack, parsePackJson } from '../pack'
import internalRequests from './de-nghi-noi-bo.json'
import contracts from './hop-dong-khach-hang.json'
import assets from './tai-san-cong-ty.json'

// JSON module types spell missing members as `?: undefined`, which Json rejects, so the files take the text path like any pack file.
function bundled (source: string): Pack {
  const parsed = parsePackJson(source)
  if (parsed.kind === 'invalid') {
    throw new Error(`Bundled pack is invalid: ${parsed.issues.map((it) => it.message).join('; ')}`)
  }
  return parsed.pack
}

export const BUNDLED_PACKS = [
  bundled(JSON.stringify(internalRequests)),
  bundled(JSON.stringify(contracts)),
  bundled(JSON.stringify(assets))
]

export function findPack (key: string): Pack | undefined {
  return BUNDLED_PACKS.find((it) => it.key === key)
}
