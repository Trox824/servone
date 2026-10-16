import type { Ref } from '@hcengineering/core'
import type { MailFolderCard, MailThreadCard } from '@servone/mail'
import { isMailOpen, newArrivals } from '../new-mail'
import { thread as buildThread } from './builders'

function thread (id: string, folders: string[], at: number): MailThreadCard {
  return buildThread({
    _id: id as Ref<MailThreadCard>,
    mailFolders: folders.map((folder) => folder as Ref<MailFolderCard>),
    mailLastMessageAt: at,
    mailHasUnread: true
  })
}

describe('newArrivals', () => {
  it('reports only threads that got a newer message', () => {
    const previous = new Map<Ref<MailThreadCard>, number>([
      ['t1' as Ref<MailThreadCard>, 100],
      ['t2' as Ref<MailThreadCard>, 200]
    ])
    const threads = [thread('t1', ['inbox'], 100), thread('t2', ['inbox'], 300), thread('t3', ['inbox'], 50)]
    expect(newArrivals(previous, threads).map((it) => it._id)).toEqual(['t2', 't3'])
  })

  it('ignores threads that are no longer unread', () => {
    const previous = new Map<Ref<MailThreadCard>, number>([['t1' as Ref<MailThreadCard>, 100]])
    const threads = [buildThread({ _id: 't1' as Ref<MailThreadCard>, mailLastMessageAt: 200, mailHasUnread: false })]
    expect(newArrivals(previous, threads)).toEqual([])
  })
})

describe('isMailOpen', () => {
  it('knows when Mail is on screen', () => {
    expect(isMailOpen(['workbench', 'acme', 'mail'])).toBe(true)
    expect(isMailOpen(['workbench', 'acme', 'tracker'])).toBe(false)
  })
})
