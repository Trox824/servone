import type { Channel } from '@hcengineering/chunter'

export const POST_POLICY_ATTR = 'servonePostPolicy'
export const THREAD_REPLIES_ATTR = 'servoneThreadReplies'

export type PostPolicy = 'everyone' | 'admins'

export interface AnnounceSettings {
  postPolicy: PostPolicy
  threadReplies: boolean
}

export interface AnnouncedChannel extends Channel {
  [POST_POLICY_ATTR]?: PostPolicy
  [THREAD_REPLIES_ATTR]?: boolean
}

export function announceSettings (channel: Channel): AnnounceSettings {
  const policy = POST_POLICY_ATTR in channel ? channel[POST_POLICY_ATTR] : undefined
  const replies = THREAD_REPLIES_ATTR in channel ? channel[THREAD_REPLIES_ATTR] : undefined
  return {
    postPolicy: policy === 'admins' ? 'admins' : 'everyone',
    threadReplies: replies !== false
  }
}
