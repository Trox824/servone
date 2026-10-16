import type { Event } from '@hcengineering/calendar'
import core, { TxProcessor, type Ref, type TxOperations } from '@hcengineering/core'
import love, { RoomAccess, RoomType, type Meeting, type Room } from '@hcengineering/love'
import { getClient } from '@hcengineering/presentation'
import { createMeeting } from '../meetings'
import { contextRoomId, MEETINGS_FLOOR } from './context'

const ROOM_WIDTH = 10

export async function ensureContextRoom (client: TxOperations, contextId: string, name: string): Promise<Room> {
  const _id = contextRoomId(contextId)
  const existing = await client.findOne(love.class.Room, { _id })
  if (existing !== undefined) return existing
  const tx = client.txFactory.createTxCreateDoc(
    love.class.Room,
    core.space.Workspace,
    {
      name,
      type: RoomType.Video,
      access: RoomAccess.Open,
      floor: MEETINGS_FLOOR,
      width: ROOM_WIDTH,
      height: 1,
      x: 0,
      y: 0,
      language: 'vi',
      startWithTranscription: false,
      startWithRecording: false,
      description: null
    },
    _id
  )
  await client.tx(tx)
  return TxProcessor.createDoc2Doc(tx)
}

export async function joinContext (contextId: string, name: string): Promise<void> {
  const room = await ensureContextRoom(getClient(), contextId, name)
  await createMeeting(room)
}

export async function makeMeeting (client: TxOperations, event: Event): Promise<void> {
  const room = await ensureContextRoom(client, event.eventId, event.title)
  await client.createMixin<Event, Meeting>(event._id, event._class, event.space, love.mixin.Meeting, { room: room._id })
}

export async function joinMeetingEvent (event: Event): Promise<void> {
  const client = getClient()
  const meeting = client.getHierarchy().as<Event, Meeting>(event, love.mixin.Meeting)
  const room = await client.findOne(love.class.Room, { _id: meeting.room })
  if (room === undefined) throw new Error(`Meeting room ${meeting.room} is missing for event ${event._id}`)
  await createMeeting(room)
}
