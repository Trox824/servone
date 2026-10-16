import type { Doc } from '@hcengineering/core'
import type { AccessPreset } from './operations'

export interface MoneyFormat {
  kind: 'money'
  currency: string
}

// Extra fields Servone stores on stock docs; the stock transactor keeps unknown fields as written.
export interface ServoneFields {
  servoneKey?: string
  servonePackKey?: string
  servoneArchived?: boolean
  servoneFormat?: MoneyFormat
  servoneOwnerField?: string
  servonePreset?: AccessPreset
  servoneConfigVersion?: string
  servoneRule?: string
}

export const ACCESS_PRESETS: AccessPreset[] = ['viewer', 'editor', 'manager']

export function withServone<T extends object> (base: T, extra: ServoneFields): T {
  return Object.assign(base, extra)
}

export function keyFields (key: string, packKey: string | undefined): ServoneFields {
  const fields: ServoneFields = { servoneKey: key }
  if (packKey !== undefined) fields.servonePackKey = packKey
  return fields
}

function textField (doc: Doc, name: keyof ServoneFields): string | undefined {
  const raw: unknown = Reflect.get(doc, name)
  return typeof raw === 'string' ? raw : undefined
}

export function readServone (doc: Doc): ServoneFields {
  const fields: ServoneFields = {}
  const key = textField(doc, 'servoneKey')
  if (key !== undefined) fields.servoneKey = key
  const packKey = textField(doc, 'servonePackKey')
  if (packKey !== undefined) fields.servonePackKey = packKey
  const configVersion = textField(doc, 'servoneConfigVersion')
  if (configVersion !== undefined) fields.servoneConfigVersion = configVersion
  const owner = textField(doc, 'servoneOwnerField')
  if (owner !== undefined) fields.servoneOwnerField = owner
  if (Reflect.get(doc, 'servoneArchived') === true) fields.servoneArchived = true
  const format: unknown = Reflect.get(doc, 'servoneFormat')
  if (typeof format === 'object' && format !== null) {
    const currency: unknown = Reflect.get(format, 'currency')
    if (typeof currency === 'string') fields.servoneFormat = { kind: 'money', currency }
  }
  const preset = ACCESS_PRESETS.find((it) => it === textField(doc, 'servonePreset'))
  if (preset !== undefined) fields.servonePreset = preset
  const rule = textField(doc, 'servoneRule')
  if (rule !== undefined) fields.servoneRule = rule
  return fields
}
