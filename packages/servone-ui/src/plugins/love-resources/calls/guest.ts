import { getClient as getAccountClient } from '@hcengineering/account-client'
import { AccountRole, type Ref } from '@hcengineering/core'
import login from '@hcengineering/login'
import { loveId, type Room } from '@hcengineering/love'
import { getMetadata } from '@hcengineering/platform'
import presentation, { copyTextToClipboard } from '@hcengineering/presentation'
import { getCurrentLocation, type Location } from '@hcengineering/ui'
import { guestLinkExpiry } from './context'

export function guestLanding (current: Location, room: Ref<Room>): Location {
  return { path: [current.path[0], current.path[1], loveId], query: { call: room } }
}

async function createGuestLink (room: Ref<Room>, meetingEnd: number): Promise<string> {
  const accounts = getAccountClient(getMetadata(login.metadata.AccountsUrl), getMetadata(presentation.metadata.Token))
  return await accounts.createAccessLink(AccountRole.Guest, {
    navigateUrl: JSON.stringify(guestLanding(getCurrentLocation(), room)),
    expiration: guestLinkExpiry(meetingEnd, Date.now()),
    personalized: false
  })
}

export function copyGuestLink (room: Ref<Room>, meetingEnd: number): Promise<void> {
  return copyTextToClipboard(createGuestLink(room, meetingEnd))
}
