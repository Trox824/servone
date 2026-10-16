import { MAIL_ATTRIBUTES } from '../fields'
import { MAIL_ACCOUNT_TYPE, MAIL_FOLDER_TYPE, MAIL_MESSAGE_TYPE, MAIL_THREAD_TYPE, MAIL_TYPES, mailboxSpaceId } from '../ids'
import type { AccountUuid } from '@hcengineering/core'

describe('mail attributes', () => {
  it('prefixes every attribute with mail', () => {
    expect(MAIL_ATTRIBUTES.filter((attribute) => !attribute.name.startsWith('mail'))).toEqual([])
  })

  it('has no duplicate names within a type', () => {
    for (const type of MAIL_TYPES) {
      const names = MAIL_ATTRIBUTES.filter((attribute) => attribute.owner === type).map((attribute) => attribute.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('defines every field of every card type', () => {
    const countOf = (type: string): number => MAIL_ATTRIBUTES.filter((attribute) => attribute.owner === type).length
    expect(countOf(MAIL_ACCOUNT_TYPE)).toBe(9)
    expect(countOf(MAIL_FOLDER_TYPE)).toBe(7)
    expect(countOf(MAIL_THREAD_TYPE)).toBe(11)
    expect(countOf(MAIL_MESSAGE_TYPE)).toBe(21)
  })

  it('derives one mailbox space per owner', () => {
    expect(mailboxSpaceId('a1' as AccountUuid)).toBe('servone:space:Mailbox:a1')
  })
})
