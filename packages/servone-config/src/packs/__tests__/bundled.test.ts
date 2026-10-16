/// <reference types="node" />
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { parsePackJson, type Pack } from '../../pack'
import { BUNDLED_PACKS, findPack } from '../index'

const SOURCE_DIR = join(__dirname, '..')
const PACK_FILES = readdirSync(SOURCE_DIR).filter((it) => it.endsWith('.json'))

function keyOfFile (file: string): string {
  return file.replace(/\.json$/, '')
}

function ownersOf (pack: Pack): Set<string> {
  return new Set(pack.operations.flatMap((op) => (op.op === 'createType' || op.op === 'createGroup' ? [op.key] : [])))
}

function typeKeysOf (pack: Pack): Set<string> {
  return new Set(pack.operations.flatMap((op) => (op.op === 'createType' ? [op.key] : [])))
}

describe('bundled pack files', () => {
  it.each(PACK_FILES)('%s parses with no issues and is named after its key', (file) => {
    const parsed = parsePackJson(readFileSync(join(SOURCE_DIR, file), 'utf8'))
    expect(parsed).toMatchObject({ kind: 'pack', pack: { key: keyOfFile(file), version: 1 } })
  })

  it('ships the three v1 packs, all loaded', () => {
    expect(BUNDLED_PACKS.map((it) => it.key)).toEqual(['de-nghi-noi-bo', 'hop-dong-khach-hang', 'tai-san-cong-ty'])
    expect(PACK_FILES.map(keyOfFile).sort()).toEqual(BUNDLED_PACKS.map((it) => it.key).sort())
  })

  it.each(BUNDLED_PACKS.map((pack) => [pack.key, pack] as const))('%s is self-contained', (_key, pack) => {
    const owners = ownersOf(pack)
    const types = typeKeysOf(pack)
    for (const op of pack.operations) {
      if (op.op === 'addField') expect(owners.has(op.type)).toBe(true)
      if (op.op === 'addLink') expect(types.has(op.from) && types.has(op.to)).toBe(true)
      if (op.op === 'createGroup') expect(op.types.every((it) => types.has(it))).toBe(true)
    }
  })

  it('uses record type names and auto-number prefixes no other pack uses', () => {
    const names = BUNDLED_PACKS.flatMap((pack) => pack.operations.flatMap((op) => (op.op === 'createType' ? [op.name.toLocaleLowerCase('vi')] : [])))
    const prefixes = BUNDLED_PACKS.flatMap((pack) =>
      pack.operations.flatMap((op) => (op.op === 'addField' && op.kind.kind === 'autoNumber' ? [op.kind.prefix] : []))
    )
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })

  it('counts what each pack creates', () => {
    const counts = BUNDLED_PACKS.map((pack) => {
      const count = (kind: Pack['operations'][number]['op']): number => pack.operations.filter((op) => op.op === kind).length
      return [pack.key, count('createType'), count('addField'), count('addLink'), count('createGroup')]
    })
    expect(counts).toEqual([
      ['de-nghi-noi-bo', 4, 39, 1, 0],
      ['hop-dong-khach-hang', 3, 30, 2, 1],
      ['tai-san-cong-ty', 2, 17, 1, 0]
    ])
  })

  it('finds a pack by key', () => {
    expect(findPack('tai-san-cong-ty')?.name).toBe('Tài sản công ty')
    expect(findPack('khong-co')).toBeUndefined()
  })
})
