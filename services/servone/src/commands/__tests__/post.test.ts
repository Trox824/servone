import type { DirectMessage } from '@hcengineering/chunter'
import type { AccountUuid, Ref } from '@hcengineering/core'
import { pickDirect } from '../post'

const BOT = 'acc-bot' as AccountUuid
const ANA = 'acc-ana' as AccountUuid
const BEN = 'acc-ben' as AccountUuid
const dm = (id: string, members: AccountUuid[]): { _id: Ref<DirectMessage>, members: AccountUuid[] } => ({
  _id: id as Ref<DirectMessage>,
  members
})

describe('pickDirect', () => {
  it('reuses the direct message holding exactly the bot and the runner', () => {
    expect(pickDirect([dm('group', [BOT, ANA, BEN]), dm('pair', [ANA, BOT])], BOT, ANA)).toBe('pair')
  })

  it('finds none when only group conversations exist', () => {
    expect(pickDirect([dm('group', [BOT, ANA, BEN]), dm('other', [BOT, BEN])], BOT, ANA)).toBeUndefined()
  })
})
