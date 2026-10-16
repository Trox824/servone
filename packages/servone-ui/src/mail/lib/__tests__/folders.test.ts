import type { Ref } from '@hcengineering/core'
import type { FolderRole, MailFolderCard } from '@servone/mail'
import { folderByRole, folderLabelKey, orderFolders, SYSTEM_ROLES } from '../folders'
import { folder as buildFolder } from './builders'

function folder (id: string, role: FolderRole, path: string): MailFolderCard {
  return buildFolder({ _id: id as Ref<MailFolderCard>, mailRole: role, mailPath: path })
}

describe('orderFolders', () => {
  it('puts system folders first in fixed order, hides All Mail, sorts labels by name', () => {
    const ordered = orderFolders([
      folder('l2', 'other', 'Khách hàng'),
      folder('t', 'trash', '[Gmail]/Trash'),
      folder('all', 'all', '[Gmail]/All Mail'),
      folder('i', 'inbox', 'INBOX'),
      folder('l1', 'other', 'Báo giá'),
      folder('s', 'sent', '[Gmail]/Sent Mail')
    ])
    expect(ordered.map((it) => it._id)).toEqual(['i', 's', 't', 'l1', 'l2'])
  })

  it('omits system roles that have no folder', () => {
    const ordered = orderFolders([folder('i', 'inbox', 'INBOX'), folder('l1', 'other', 'Báo giá')])
    expect(ordered.map((it) => it._id)).toEqual(['i', 'l1'])
  })
})

describe('folderByRole', () => {
  it('finds the folder with the given role', () => {
    const inbox = folder('i', 'inbox', 'INBOX')
    const sent = folder('s', 'sent', '[Gmail]/Sent Mail')
    expect(folderByRole([inbox, sent], 'sent')).toBe(sent)
    expect(folderByRole([inbox, sent], 'trash')).toBeUndefined()
  })
})

describe('folderLabelKey', () => {
  it('has a label key for every system role', () => {
    for (const role of SYSTEM_ROLES) expect(folderLabelKey(role)).toBeDefined()
  })

  it('leaves label lookup to the card title for other and all', () => {
    expect(folderLabelKey('other')).toBeUndefined()
    expect(folderLabelKey('all')).toBeUndefined()
  })
})
