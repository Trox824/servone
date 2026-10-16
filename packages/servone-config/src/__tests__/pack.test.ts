import type { JsonObject } from '../json'
import { packStatus, parsePack, parsePackJson, type Pack } from '../pack'
import type { ConfigSnapshot, FieldInfo, RecordTypeInfo } from '../types'

const ASSETS: JsonObject = {
  key: 'tai-san-cong-ty',
  version: 1,
  name: 'Tài sản công ty',
  description: 'Sổ tài sản và nhật ký bảo trì',
  industry: 'Mọi ngành',
  operations: [
    { op: 'createType', key: 'tai-san', name: 'Tài sản' },
    { op: 'addField', type: 'tai-san', key: 'so-serial', name: 'Số serial', kind: { kind: 'text' } },
    { op: 'createType', key: 'bao-tri', name: 'Nhật ký bảo trì' },
    { op: 'addLink', key: 'tai-san-bao-tri', from: 'tai-san', to: 'bao-tri', fromName: 'Nhật ký bảo trì', toName: 'Tài sản', fromMany: true, toMany: false }
  ]
}

function withOps (operations: JsonObject[]): JsonObject {
  return { ...ASSETS, operations }
}

function mustPack (input: JsonObject): Pack {
  const parsed = parsePack(input)
  if (parsed.kind === 'invalid') throw new Error(parsed.issues.map((it) => it.message).join('; '))
  return parsed.pack
}

function recordType (key: string, fields: FieldInfo[], packKey?: string): RecordTypeInfo {
  return { key, name: key, isSystem: false, isArchived: false, spaces: [], fields, access: [], packKey, automations: [] }
}

function snapshot (parts: Partial<ConfigSnapshot>): ConfigSnapshot {
  return { version: 'v1', types: [], groups: [], links: [], spaces: [], ...parts }
}

const SERIAL: FieldInfo = { key: 'so-serial', name: 'Số serial', kind: { kind: 'text' }, isRequired: false, isBuiltIn: false, packKey: 'tai-san-cong-ty' }

describe('parsePack', () => {
  it('reads the pack and stamps its key on every operation', () => {
    const pack = mustPack(ASSETS)
    expect(pack).toMatchObject({ key: 'tai-san-cong-ty', version: 1, name: 'Tài sản công ty', industry: 'Mọi ngành' })
    expect(pack.operations.map((it) => it.op)).toEqual(['createType', 'addField', 'createType', 'addLink'])
    expect(pack.operations.every((it) => it.packKey === 'tai-san-cong-ty')).toBe(true)
  })

  it('accepts operations that already carry this pack key', () => {
    const pack = mustPack(withOps([{ op: 'createType', key: 'tai-san', name: 'Tài sản', packKey: 'tai-san-cong-ty' }]))
    expect(pack.operations).toHaveLength(1)
  })

  it('refuses operations a pack cannot re-install', () => {
    const parsed = parsePack(
      withOps([
        { op: 'createType', key: 'tai-san', name: 'Tài sản' },
        { op: 'setView', type: 'tai-san', view: { columns: ['so-serial'] } },
        { op: 'archiveType', type: 'tai-san' }
      ])
    )
    expect(parsed).toEqual({
      kind: 'invalid',
      issues: [expect.objectContaining({ opIndex: 1, code: 'unsupported' }), expect.objectContaining({ opIndex: 2, code: 'unsupported' })]
    })
  })

  it('needs a key on every link', () => {
    const parsed = parsePack(
      withOps([{ op: 'addLink', from: 'tai-san', to: 'bao-tri', fromName: 'Bảo trì', toName: 'Tài sản', fromMany: true, toMany: false }])
    )
    expect(parsed).toEqual({ kind: 'invalid', issues: [expect.objectContaining({ opIndex: 0, code: 'invalid-input' })] })
  })

  it('refuses an operation that names another pack', () => {
    const parsed = parsePack(withOps([{ op: 'createType', key: 'tai-san', name: 'Tài sản', packKey: 'goi-khac' }]))
    expect(parsed.kind === 'invalid' ? parsed.issues.map((it) => it.message) : []).toEqual([
      'Thao tác thuộc gói "goi-khac", không phải gói "tai-san-cong-ty"'
    ])
  })

  it('refuses sample records, a bad key and a bad version', () => {
    const parsed = parsePack({ ...ASSETS, key: 'Tài Sản', version: 0, sampleRecords: [] })
    expect(parsed.kind === 'invalid' ? parsed.issues.map((it) => it.opIndex) : []).toEqual([-1, -1, -1])
    expect(parsed.kind === 'invalid' ? parsed.issues.map((it) => it.message).join('\n') : '').toMatch(/hồ sơ mẫu/)
  })

  it('reports operations the core cannot read before checking the pack', () => {
    const parsed = parsePack(withOps([{ op: 'createType', key: 'tai-san' }]))
    expect(parsed).toEqual({ kind: 'invalid', issues: [expect.objectContaining({ opIndex: 0, code: 'invalid-input' })] })
  })

  it('refuses an empty pack and a non-object', () => {
    expect(parsePack(withOps([])).kind).toBe('invalid')
    expect(parsePack([]).kind).toBe('invalid')
  })

  it('reports broken JSON text', () => {
    const parsed = parsePackJson('{"key": ')
    expect(parsed.kind === 'invalid' ? parsed.issues[0].message : '').toMatch(/^JSON không hợp lệ/)
  })

  it('refuses a pack that repeats a type, field, link or group key', () => {
    const parsed = parsePack(
      withOps([
        { op: 'createType', key: 'tai-san', name: 'Tài sản' },
        { op: 'createType', key: 'tai-san', name: 'Tài sản (lần 2)' },
        { op: 'addField', type: 'tai-san', key: 'so-serial', name: 'Số serial', kind: { kind: 'text' } },
        { op: 'addField', type: 'tai-san', key: 'so-serial', name: 'Số serial (lần 2)', kind: { kind: 'text' } },
        { op: 'createType', key: 'bao-tri', name: 'Nhật ký bảo trì' },
        { op: 'addLink', key: 'tai-san-bao-tri', from: 'tai-san', to: 'bao-tri', fromName: 'Bảo trì', toName: 'Tài sản', fromMany: true, toMany: false },
        { op: 'addLink', key: 'tai-san-bao-tri', from: 'tai-san', to: 'bao-tri', fromName: 'Bảo trì 2', toName: 'Tài sản', fromMany: true, toMany: false },
        { op: 'createGroup', key: 'thong-tin-them', name: 'Thông tin thêm', types: ['tai-san'] },
        { op: 'createGroup', key: 'thong-tin-them', name: 'Thông tin thêm (lần 2)', types: ['tai-san'] }
      ])
    )
    expect(parsed.kind === 'invalid' ? parsed.issues.map((it) => it.opIndex) : []).toEqual([1, 3, 6, 8])
    expect(parsed.kind === 'invalid' ? parsed.issues.every((it) => it.code === 'duplicate-key') : false).toBe(true)
  })
})

describe('packStatus', () => {
  const pack = mustPack(ASSETS)

  it('is notInstalled when nothing carries the pack key', () => {
    expect(packStatus(pack, snapshot({ types: [recordType('tai-san', [])] }))).toBe('notInstalled')
  })

  it('is partial when some of the pack is there', () => {
    expect(packStatus(pack, snapshot({ types: [recordType('tai-san', [SERIAL], 'tai-san-cong-ty')] }))).toBe('partial')
  })

  it('does not count an archived pack type as installed', () => {
    const archived = { ...recordType('tai-san', [], 'tai-san-cong-ty'), isArchived: true }
    expect(packStatus(pack, snapshot({ types: [archived] }))).toBe('notInstalled')
  })

  it('is installed when every operation is there', () => {
    const installed = snapshot({
      types: [recordType('tai-san', [SERIAL], 'tai-san-cong-ty'), recordType('bao-tri', [], 'tai-san-cong-ty')],
      links: [
        {
          key: 'tai-san-bao-tri',
          from: 'tai-san',
          to: 'bao-tri',
          fromName: 'Nhật ký bảo trì',
          toName: 'Tài sản',
          fromMany: true,
          toMany: false,
          packKey: 'tai-san-cong-ty'
        }
      ]
    })
    expect(packStatus(pack, installed)).toBe('installed')
  })
})
