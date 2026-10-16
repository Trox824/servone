import type { AccountUuid, Doc, PersonId, Ref } from '@hcengineering/core'
import { type Asset, getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
import type { ContextId, StepId } from '@hcengineering/process'

// Keys travel in MCP tool calls and pack files; 80 keeps them on one line.
const MAX_KEY_LEN = 80
const KEY_PATTERN = new RegExp(`^[a-z0-9][a-z0-9._-]{0,${MAX_KEY_LEN - 1}}$`)
const EMBEDDED_PREFIX = getEmbeddedLabel('')

export function isValidKey (key: string): boolean {
  return KEY_PATTERN.test(key)
}

export function slugify (name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_KEY_LEN)
    .replace(/-+$/, '')
}

export function labelText (label: IntlString): string {
  if (label.startsWith(EMBEDDED_PREFIX)) return label.slice(EMBEDDED_PREFIX.length)
  // Plugin strings need the front's i18n loader, which servone-mcp (Node) does not have.
  return label.slice(label.lastIndexOf(':') + 1)
}

export function toLabel (text: string): IntlString {
  return getEmbeddedLabel(text.trim())
}

export function sameName (a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('vi') === b.trim().toLocaleLowerCase('vi')
}

export function toAsset (icon: string): Asset {
  return icon as Asset
}

export function toRef<T extends Doc> (id: string): Ref<T> {
  return id as Ref<T>
}

export function toAccountUuid (raw: string): AccountUuid {
  return raw as AccountUuid
}

export function toPersonId (raw: string): PersonId {
  return raw as PersonId
}

export function toContextId (raw: string): ContextId {
  return raw as ContextId
}

export function toStepId (raw: string): StepId {
  return raw as StepId
}
