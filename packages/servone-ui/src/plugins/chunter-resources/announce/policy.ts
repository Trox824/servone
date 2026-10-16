import type { AnnounceSettings } from './schema'

export interface Actor {
  account: string
  isWorkspaceAdmin: boolean
}

export interface ChannelAccess {
  owners: readonly string[]
  settings: AnnounceSettings
}

export function canManage (actor: Actor, owners: readonly string[]): boolean {
  return actor.isWorkspaceAdmin || owners.includes(actor.account)
}

export function canEditChannel (channel: { owners?: readonly string[] }, actor: Actor): boolean {
  return canManage(actor, channel.owners ?? [])
}

export function canPost (actor: Actor, channel: ChannelAccess): boolean {
  return channel.settings.postPolicy === 'everyone' || canManage(actor, channel.owners)
}

export function canReplyInThread (actor: Actor, channel: ChannelAccess): boolean {
  return canPost(actor, channel) || channel.settings.threadReplies
}

export function canSetOwners (actor: Actor, current: readonly string[], next: readonly string[]): boolean {
  if (!canManage(actor, current)) return false
  return next.length > 0 || actor.isWorkspaceAdmin
}
