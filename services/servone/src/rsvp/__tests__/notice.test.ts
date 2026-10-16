import { noticeFor, statusOfStamp } from '../notice'

const reply = { stamp: 'accepted:1000:2000', isOrganizerCopy: false, guest: 'an', organizer: 'binh' }

describe('noticeFor', () => {
  it('tells the organizer which answer the guest gave', () => {
    expect(noticeFor(reply)).toBe('servone-calendar:string:RsvpAcceptedNotice')
    expect(noticeFor({ ...reply, stamp: 'declined:1000:2000' })).toBe('servone-calendar:string:RsvpDeclinedNotice')
    expect(noticeFor({ ...reply, stamp: 'tentative:1000:2000' })).toBe('servone-calendar:string:RsvpTentativeNotice')
  })
  it('stays quiet about the organizer answering their own event', () => {
    expect(noticeFor({ ...reply, isOrganizerCopy: true })).toBeUndefined()
    expect(noticeFor({ ...reply, guest: 'binh' })).toBeUndefined()
  })
  it('ignores a stamp it cannot read', () => {
    expect(noticeFor({ ...reply, stamp: '' })).toBeUndefined()
    expect(statusOfStamp('maybe:1:2')).toBeUndefined()
  })
})
