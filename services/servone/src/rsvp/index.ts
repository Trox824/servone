// Tells the organizer in their inbox when a guest answers an event invite.
// Reads the transactor's `tx` topic because the stock transactor cannot load a Servone trigger.
import { createRestTxOperations } from '@hcengineering/api-client'
import calendar, { AccessLevel, type Event } from '@hcengineering/calendar'
import contact, { formatName, type Person, type SocialIdentityRef } from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type Class,
  type MeasureContext,
  type Ref,
  systemAccountUuid,
  type Tx,
  type TxOperations,
  type TxUpdateDoc,
  type WorkspaceUuid
} from '@hcengineering/core'
import { getPlatformQueue } from '@hcengineering/kafka'
import notification, { type CommonInboxNotification } from '@hcengineering/notification'
import { getTransactorEndpoint } from '@hcengineering/server-client'
import { QueueTopic } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'

import config from '../config'
import { noticeFor } from './notice'

interface RsvpEvent extends Event {
  servoneRsvp?: string
}
// Class<T> never uses T, so the stock ref types the custom field without a cast.
const rsvpEventClass: Ref<Class<RsvpEvent>> = calendar.class.Event

const clients = new Map<WorkspaceUuid, Promise<TxOperations>>()

async function connect (workspace: WorkspaceUuid): Promise<TxOperations> {
  const token = generateToken(systemAccountUuid, workspace, { service: config.rsvp.ServiceId })
  const endpoint = await getTransactorEndpoint(token)
  return await createRestTxOperations(endpoint, workspace, token, true)
}

async function openWorkspace (workspace: WorkspaceUuid): Promise<TxOperations> {
  const cached = clients.get(workspace)
  if (cached !== undefined) return await cached
  const opening = connect(workspace)
  clients.set(workspace, opening)
  try {
    return await opening
  } catch (error) {
    clients.delete(workspace)
    throw error
  }
}

// Per-occurrence answers (servoneRsvpOccurrences) re-encode every entry, so which one changed is not readable from the tx.
function readReply (tx: Tx): TxUpdateDoc<RsvpEvent> | undefined {
  if (tx._class !== core.class.TxUpdateDoc) return undefined
  const update = tx as TxUpdateDoc<RsvpEvent>
  return update.operations.servoneRsvp !== undefined ? update : undefined
}

async function applyReply (ctx: MeasureContext, client: TxOperations, reply: TxUpdateDoc<RsvpEvent>): Promise<void> {
  const stamp = reply.operations.servoneRsvp
  if (stamp === undefined) return
  // A queue retry must not post the notice twice.
  const noticeId = `${reply._id}-rsvp` as Ref<CommonInboxNotification>
  if ((await client.findOne(notification.class.CommonInboxNotification, { _id: noticeId })) !== undefined) return
  const copy = await client.findOne(rsvpEventClass, { _id: reply.objectId })
  if (copy === undefined) return
  const organizerCopy = await client.findOne(calendar.class.Event, { eventId: copy.eventId, access: AccessLevel.Owner })
  if (organizerCopy === undefined) return
  const identities = await client.findAll(contact.class.SocialIdentity, {
    _id: { $in: [copy.user, organizerCopy.user] as SocialIdentityRef[] }
  })
  const personOf = (socialId: string): Ref<Person> | undefined => identities.find((identity) => identity._id === socialId)?.attachedTo
  const guestRef = personOf(copy.user)
  const organizerRef = personOf(organizerCopy.user)
  if (guestRef === undefined || organizerRef === undefined) return
  const message = noticeFor({ stamp, isOrganizerCopy: copy.access === AccessLevel.Owner, guest: guestRef, organizer: organizerRef })
  if (message === undefined) return

  const [guest, organizer] = await Promise.all([
    client.findOne(contact.class.Person, { _id: guestRef }),
    client.findOne(contact.class.Person, { _id: organizerRef })
  ])
  if (guest === undefined || organizer?.personUuid === undefined) return
  // An employee's person uuid is their account uuid; the brands differ only in name.
  const user = organizer.personUuid as AccountUuid
  const space = await client.findOne(contact.class.PersonSpace, { person: organizer._id })
  if (space === undefined) {
    ctx.warn('rsvp notice skipped: organizer has no person space', { organizer: organizer._id })
    return
  }
  const context = await client.findOne(notification.class.DocNotifyContext, { objectId: organizerCopy._id, user })
  // System tokens carry no socialIds[0], so modifiedBy is pinned or the transactor rejects the tx.
  const contextId = context?._id ?? await client.createDoc(
    notification.class.DocNotifyContext,
    space._id,
    { objectId: organizerCopy._id, objectClass: organizerCopy._class, objectSpace: organizerCopy.space, user, isPinned: false, hidden: false },
    undefined,
    undefined,
    core.account.System
  )
  await client.createDoc(
    notification.class.CommonInboxNotification,
    space._id,
    {
      user,
      objectId: organizerCopy._id,
      objectClass: organizerCopy._class,
      icon: calendar.icon.Calendar,
      message,
      props: { name: formatName(guest.name), title: organizerCopy.title },
      isViewed: false,
      archived: false,
      docNotifyContext: contextId
    },
    noticeId,
    undefined,
    core.account.System
  )
}

export function startRsvp (ctx: MeasureContext): () => Promise<void> {
  const queue = getPlatformQueue(config.rsvp.ServiceId, config.rsvp.QueueRegion)

  // A throw makes the queue retry the same message with backoff, so a transactor restart loses nothing.
  const consumer = queue.createConsumer<Tx>(ctx, QueueTopic.Tx, queue.getClientId(), async (ctx, message) => {
    const reply = readReply(message.value)
    if (reply === undefined) return
    await applyReply(ctx, await openWorkspace(message.workspace), reply)
  })
  return async () => {
    await consumer.close()
  }
}
