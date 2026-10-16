import type { ChatEvent, ChatEventName } from './events'

export type AuthorKind = 'person' | 'bot' | 'integration'

export interface ChatHookFilters {
  events: ChatEventName[]
  mentionsOnly: boolean
  peopleOnly: boolean
  includeIntegrations: boolean
}

// Only events that carry text can be checked for mentions; the others pass the mentions filter.
const TEXT_EVENTS: readonly ChatEventName[] = ['message.posted', 'message.updated', 'thread.reply']

// Checks what the tx alone tells, so most events are dropped before any workspace read.
export function wantsEvent (hook: ChatHookFilters, event: ChatEvent): boolean {
  if (!hook.events.includes(event.name)) return false
  if (hook.mentionsOnly && TEXT_EVENTS.includes(event.name) && !event.hasMentions) return false
  if (event.isIntegration) return acceptsAuthor(hook, 'integration')
  return true
}

export function acceptsAuthor (hook: ChatHookFilters, author: AuthorKind): boolean {
  if (author === 'integration') return hook.includeIntegrations && !hook.peopleOnly
  if (author === 'bot') return !hook.peopleOnly
  return true
}
