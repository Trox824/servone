import type { ConfigSession } from './client'
import { describe } from './describe'
import { ConfigError } from './errors'
import { isFieldKind } from './fields'
import { isValidKey } from './keys'
import type { CreateTypeOp } from './operations'
import type { Pack, PackMeta, PackOperation } from './pack'
import type { ConfigSnapshot, FieldInfo, RecordTypeInfo } from './types'

function chosenTypes (snapshot: ConfigSnapshot, typeKeys: string[]): RecordTypeInfo[] {
  return typeKeys.map((key) => {
    const type = snapshot.types.find((it) => it.key === key)
    if (type === undefined) throw new ConfigError('not-found', `Không tìm thấy biểu mẫu "${key}"`)
    if (type.isSystem) throw new ConfigError('invalid', `${type.name} là loại hệ thống; gói chỉ chứa biểu mẫu của công ty`)
    if (type.isArchived) throw new ConfigError('invalid', `${type.name} đã lưu trữ; hãy khôi phục trước khi xuất`)
    return type
  })
}

// System types exist in every workspace under the same key; a customer parent must travel in the pack.
function requireParent (snapshot: ConfigSnapshot, chosen: Set<string>, type: RecordTypeInfo): void {
  if (type.basedOn === undefined || chosen.has(type.basedOn)) return
  const parent = snapshot.types.find((it) => it.key === type.basedOn)
  if (parent?.isSystem === true) return
  throw new ConfigError('invalid', `${type.name} dựa trên ${parent?.name ?? type.basedOn}; hãy chọn cả loại này`)
}

function parentsFirst (types: RecordTypeInfo[]): RecordTypeInfo[] {
  const ordered: RecordTypeInfo[] = []
  const place = (type: RecordTypeInfo): void => {
    if (ordered.includes(type)) return
    const parent = types.find((it) => it.key === type.basedOn)
    if (parent !== undefined) place(parent)
    ordered.push(type)
  }
  for (const type of types) place(type)
  return ordered
}

function fieldOps (owner: string, fields: FieldInfo[], packKey: string): PackOperation[] {
  const ops: PackOperation[] = []
  for (const field of fields) {
    const kind = field.kind
    // Built-in fields come with the type; read-only references are Huly refs that a pack cannot recreate.
    if (field.isBuiltIn || !isFieldKind(kind)) continue
    ops.push({ op: 'addField', type: owner, key: field.key, name: field.name, kind, required: field.isRequired, packKey })
  }
  return ops
}

export async function exportPack (session: ConfigSession, typeKeys: string[], meta: PackMeta): Promise<Pack> {
  if (!isValidKey(meta.key)) throw new ConfigError('invalid', `Khóa gói "${meta.key}" không hợp lệ`)
  if (meta.name.trim() === '') throw new ConfigError('invalid', 'Tên gói không được để trống')
  if (typeKeys.length === 0) throw new ConfigError('invalid', 'Hãy chọn ít nhất một biểu mẫu')
  const snapshot = await describe(session)
  const types = chosenTypes(snapshot, [...new Set(typeKeys)])
  const chosen = new Set(types.map((it) => it.key))
  for (const type of types) requireParent(snapshot, chosen, type)

  const operations: PackOperation[] = []
  for (const type of parentsFirst(types)) {
    const create: CreateTypeOp & { packKey: string } = { op: 'createType', key: type.key, name: type.name, packKey: meta.key }
    if (type.basedOn !== undefined) create.basedOn = type.basedOn
    operations.push(create, ...fieldOps(type.key, type.fields, meta.key))
  }
  for (const group of snapshot.groups.filter((it) => chosen.has(it.type))) {
    operations.push(
      { op: 'createGroup', key: group.key, name: group.name, types: [group.type], packKey: meta.key },
      ...fieldOps(group.key, group.fields, meta.key)
    )
  }
  for (const link of snapshot.links.filter((it) => chosen.has(it.from) && chosen.has(it.to))) {
    operations.push({
      op: 'addLink',
      key: link.key,
      from: link.from,
      to: link.to,
      fromName: link.fromName,
      toName: link.toName,
      fromMany: link.fromMany,
      toMany: link.toMany,
      packKey: meta.key
    })
  }
  return {
    key: meta.key,
    version: meta.version,
    name: meta.name.trim(),
    description: meta.description.trim(),
    industry: meta.industry.trim(),
    operations
  }
}
