import core, {
  AccountRole,
  ClassifierKind,
  DOMAIN_MODEL,
  getCurrentAccount,
  hasAccountRole,
  type Class,
  type Doc,
  type Ref,
  type TxOperations
} from '@hcengineering/core'
import calendar from '@hcengineering/calendar'
import hr from '@hcengineering/hr'
import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
import { RSVP_ATTR, RSVP_NOTE_ATTR, RSVP_OCCURRENCES_ATTR, RSVP_PROPOSAL_ATTR } from './lib/rsvp'
import { GUESTS_CAN_INVITE_ATTR, GUESTS_CAN_MODIFY_ATTR, GUESTS_CAN_SEE_GUESTS_ATTR } from './lib/guests'
import { DEFAULT_ALL_DAY_REMINDER_ATTR, DEFAULT_DURATION_ATTR, DEFAULT_REMINDER_ATTR } from './lib/reminders'
import { ANNUAL_LEAVE_DAYS_ATTR } from '../../../lib/leave'
import { BOOKING_RESOURCE_ATTR, BOOKING_STATE_ATTR, RESOURCE_CLASS } from '@servone/approvals/src/booking'

interface CustomAttribute {
  attributeOf: Ref<Class<Doc>>
  name: string
  label: string
  type: typeof core.class.TypeString | typeof core.class.TypeNumber | typeof core.class.TypeBoolean
  typeLabel: IntlString
}

const ATTRIBUTES: CustomAttribute[] = [
  { attributeOf: calendar.class.Event, name: RSVP_ATTR, label: 'RSVP', type: core.class.TypeString, typeLabel: core.string.String },
  { attributeOf: calendar.class.Event, name: RSVP_OCCURRENCES_ATTR, label: 'RSVP per occurrence', type: core.class.TypeString, typeLabel: core.string.String },
  { attributeOf: calendar.class.Event, name: RSVP_NOTE_ATTR, label: 'RSVP note', type: core.class.TypeString, typeLabel: core.string.String },
  { attributeOf: calendar.class.Event, name: RSVP_PROPOSAL_ATTR, label: 'Proposed time', type: core.class.TypeString, typeLabel: core.string.String },
  { attributeOf: calendar.class.Event, name: GUESTS_CAN_MODIFY_ATTR, label: 'Guests can modify', type: core.class.TypeBoolean, typeLabel: core.string.Boolean },
  { attributeOf: calendar.class.Event, name: GUESTS_CAN_INVITE_ATTR, label: 'Guests can invite', type: core.class.TypeBoolean, typeLabel: core.string.Boolean },
  { attributeOf: calendar.class.Event, name: GUESTS_CAN_SEE_GUESTS_ATTR, label: 'Guests can see guests', type: core.class.TypeBoolean, typeLabel: core.string.Boolean },
  { attributeOf: calendar.class.Calendar, name: DEFAULT_REMINDER_ATTR, label: 'Default reminder', type: core.class.TypeNumber, typeLabel: core.string.Number },
  { attributeOf: calendar.class.Calendar, name: DEFAULT_ALL_DAY_REMINDER_ATTR, label: 'Default all-day reminder', type: core.class.TypeNumber, typeLabel: core.string.Number },
  { attributeOf: calendar.class.Calendar, name: DEFAULT_DURATION_ATTR, label: 'Default event duration', type: core.class.TypeNumber, typeLabel: core.string.Number },
  { attributeOf: calendar.class.Event, name: BOOKING_RESOURCE_ATTR, label: 'Booked resource', type: core.class.TypeString, typeLabel: core.string.String },
  { attributeOf: calendar.class.Event, name: BOOKING_STATE_ATTR, label: 'Booking state', type: core.class.TypeString, typeLabel: core.string.String },
  { attributeOf: hr.class.Department, name: ANNUAL_LEAVE_DAYS_ATTR, label: 'Annual leave days', type: core.class.TypeNumber, typeLabel: core.string.Number }
]

export async function ensureResourceClass (client: TxOperations): Promise<void> {
  if (client.getHierarchy().hasClass(RESOURCE_CLASS)) return
  await client.createDoc(
    core.class.Class,
    core.space.Model,
    { label: getEmbeddedLabel('Bookable resource'), kind: ClassifierKind.CLASS, extends: core.class.Doc, domain: DOMAIN_MODEL },
    RESOURCE_CLASS
  )
}

export async function ensureLichAttributes (client: TxOperations): Promise<void> {
  if (!hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)) return
  await ensureResourceClass(client)
  const existing = await client.findAll(core.class.Attribute, { name: { $in: ATTRIBUTES.map((a) => a.name) } })
  for (const attribute of ATTRIBUTES) {
    if (existing.some((e) => e.attributeOf === attribute.attributeOf && e.name === attribute.name)) continue
    await client.createDoc(core.class.Attribute, core.space.Model, {
      attributeOf: attribute.attributeOf,
      name: attribute.name,
      label: getEmbeddedLabel(attribute.label),
      type: { _class: attribute.type, label: attribute.typeLabel },
      isCustom: true,
      hidden: true
    })
  }
}
