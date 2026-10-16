import type { Doc, Ref } from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'

import { countUnread, selectUnread } from '../unread'
import { context, row } from './fixtures'

const general = context('ctx-general', 'general', 'general')
const quietChannel = context('ctx-quiet', 'quiet', 'quiet', 'nothing')
const dm = context('ctx-dm', 'dm-bob', 'dm-bob')
const mutedDm = context('ctx-muted', 'dm-eve', 'dm-eve', 'mentions')
const dmThread = context('ctx-dm-thread', 'parent-message', 'dm-bob')
const contexts = new Map<Ref<DocNotifyContext>, DocNotifyContext>(
  [general, quietChannel, dm, mutedDm, dmThread].map((it) => [it._id, it])
)
const directs = new Set<Ref<Doc>>(['dm-bob', 'dm-eve'].map((id) => id as Ref<Doc>))

function kinds (rows: Parameters<typeof selectUnread>[0]): string[] {
  return selectUnread(rows, contexts, directs).map((item) => `${item.notification._id}:${item.kind}`)
}

describe('selectUnread', () => {
  it('keeps channel mentions and drops plain channel activity', () => {
    expect(
      kinds([
        row({ id: 'm1', kind: 'mention', context: 'ctx-general', message: 'msg1' }),
        row({ id: 'a1', kind: 'activity', context: 'ctx-general', message: 'msg2' })
      ])
    ).toEqual(['m1:mention'])
  })

  it('keeps DM messages, including thread replies inside a DM', () => {
    expect(
      kinds([
        row({ id: 'a1', kind: 'activity', context: 'ctx-dm', message: 'msg1' }),
        row({ id: 'a2', kind: 'activity', context: 'ctx-dm-thread', message: 'msg2' })
      ])
    ).toEqual(['a1:direct', 'a2:direct'])
  })

  it('drops everything from a channel set to nothing', () => {
    expect(kinds([row({ id: 'm1', kind: 'mention', context: 'ctx-quiet', message: 'msg1' })])).toEqual([])
  })

  it('drops plain messages from a DM muted to mentions only', () => {
    expect(
      kinds([
        row({ id: 'a1', kind: 'activity', context: 'ctx-muted', message: 'msg1' }),
        row({ id: 'm1', kind: 'mention', context: 'ctx-muted', message: 'msg2' })
      ])
    ).toEqual(['m1:mention'])
  })

  it('counts a mention inside a DM once, as a mention', () => {
    expect(
      kinds([
        row({ id: 'a1', kind: 'activity', context: 'ctx-dm', message: 'msg1' }),
        row({ id: 'm1', kind: 'mention', context: 'ctx-dm', message: 'msg1' })
      ])
    ).toEqual(['m1:mention'])
  })

  it('ignores reactions in a DM', () => {
    expect(kinds([row({ id: 'r1', kind: 'reaction', context: 'ctx-dm', message: 'msg1' })])).toEqual([])
  })
})

describe('countUnread', () => {
  it('counts mentions and direct messages', () => {
    const items = selectUnread(
      [
        row({ id: 'm1', kind: 'mention', context: 'ctx-general', message: 'msg1' }),
        row({ id: 'a1', kind: 'activity', context: 'ctx-dm', message: 'msg2' }),
        row({ id: 'a2', kind: 'activity', context: 'ctx-dm', message: 'msg3' })
      ],
      contexts,
      directs
    )
    expect(countUnread(items)).toEqual({ mentions: 1, directs: 2 })
  })
})
