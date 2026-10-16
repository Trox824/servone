import type { ConfigSnapshot, GroupInfo } from '@servone/config'
import { byName } from './type-list'

export function groupsOf (snapshot: ConfigSnapshot, typeKey: string): GroupInfo[] {
  return snapshot.groups.filter((it) => it.type === typeKey).sort(byName)
}
