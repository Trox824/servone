import type { Ref } from '@hcengineering/core'
import type { MailFolderCard } from '../fields'
import { planActions } from '../actions'
import { encodeLocation, foldersOf, parseLocation, readLocation } from '../locations'
import type { FolderRole } from '../types'

const INBOX = 'inbox' as Ref<MailFolderCard>
const WORK = 'work' as Ref<MailFolderCard>
const ALL = 'all' as Ref<MailFolderCard>
const ARCHIVE = 'archive' as Ref<MailFolderCard>
const TRASH = 'trash' as Ref<MailFolderCard>
const roles = new Map<Ref<MailFolderCard>, FolderRole>([[INBOX, 'inbox'], [WORK, 'other'], [ALL, 'all'], [ARCHIVE, 'archive'], [TRASH, 'trash']])
const both = [{ uid: 5, folder: INBOX }, { uid: 9, folder: WORK }]

describe('locations', () => {
  it('round-trips and lists folders', () => {
    const text = encodeLocation({ uid: 5, folder: INBOX })
    expect(parseLocation(text)).toEqual({ uid: 5, folder: INBOX })
    expect(foldersOf(['5@inbox', '9@work', '6@inbox'])).toEqual([INBOX, WORK])
  })

  it('rejects a malformed location', () => {
    expect(() => parseLocation('inbox')).toThrow('Bad mail location')
    expect(readLocation('inbox')).toBeUndefined()
  })
})

describe('planActions', () => {
  it('sets flags in every folder the message is in', () => {
    expect(planActions({ mailIsRead: true, mailIsStarred: false }, both, roles)).toEqual([
      { kind: 'addFlags', folder: INBOX, uids: [5], flags: ['\\Seen'] },
      { kind: 'addFlags', folder: WORK, uids: [9], flags: ['\\Seen'] },
      { kind: 'removeFlags', folder: INBOX, uids: [5], flags: ['\\Flagged'] },
      { kind: 'removeFlags', folder: WORK, uids: [9], flags: ['\\Flagged'] }
    ])
  })

  it('archives by moving out of the inbox only, keeping labels', () => {
    expect(planActions({ mailTargetFolder: ALL }, both, roles)).toEqual([{ kind: 'move', folder: INBOX, uids: [5], target: ALL }])
  })

  it('archives nothing when the message is not in the inbox', () => {
    expect(planActions({ mailTargetFolder: ALL }, [{ uid: 9, folder: WORK }], roles)).toEqual([])
  })

  it('moves to trash from every folder', () => {
    expect(planActions({ mailTargetFolder: TRASH }, both, roles)).toEqual([
      { kind: 'move', folder: INBOX, uids: [5], target: TRASH },
      { kind: 'move', folder: WORK, uids: [9], target: TRASH }
    ])
  })

  it('archives into an Archive folder from the inbox only', () => {
    expect(planActions({ mailTargetFolder: ARCHIVE }, both, roles)).toEqual([{ kind: 'move', folder: INBOX, uids: [5], target: ARCHIVE }])
  })

  it('moves out of All Mail only to trash, and only when no label holds the message', () => {
    const withAll = [{ uid: 5, folder: INBOX }, { uid: 40, folder: ALL }]
    expect(planActions({ mailTargetFolder: TRASH }, withAll, roles)).toEqual([{ kind: 'move', folder: INBOX, uids: [5], target: TRASH }])
    expect(planActions({ mailTargetFolder: TRASH }, [{ uid: 40, folder: ALL }], roles)).toEqual([{ kind: 'move', folder: ALL, uids: [40], target: TRASH }])
    expect(planActions({ mailTargetFolder: WORK }, [{ uid: 40, folder: ALL }], roles)).toEqual([])
    expect(planActions({ mailTargetFolder: INBOX }, [{ uid: 40, folder: ALL }], roles)).toEqual([])
  })

  it('moves out of a plain Archive folder', () => {
    expect(planActions({ mailTargetFolder: TRASH }, [{ uid: 8, folder: ARCHIVE }], roles)).toEqual([{ kind: 'move', folder: ARCHIVE, uids: [8], target: TRASH }])
  })

  it('expunges everywhere when deleted forever', () => {
    expect(planActions({ mailIsDeleted: true }, [{ uid: 3, folder: TRASH }], roles)).toEqual([{ kind: 'expunge', folder: TRASH, uids: [3] }])
  })
})
