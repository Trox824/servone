import { translate } from '@hcengineering/platform'
import { str } from '../sprints/plugin'
import type { StringKey } from '../sprints/strings'

export type FormText = (key: StringKey) => string

export async function loadFormText (keys: readonly StringKey[], language: string): Promise<FormText> {
  const entries = await Promise.all(keys.map(async (key) => [key, await translate(str[key], {}, language)] as const))
  const texts = new Map<StringKey, string>(entries)
  return (key) => texts.get(key) ?? key
}
