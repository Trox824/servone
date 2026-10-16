export type Visibility = 'public' | 'freeBusy' | 'private'
export type Rsvp = 'accepted' | 'tentative' | 'declined'
export type View = 'ngay' | 'ba-ngay' | 'tuan' | 'thang' | 'lich-bieu'
export type Page = View | 'chia-se' | 'tim-kiem' | 'tai-nguyen'
export type Lang = 'vi' | 'en'

export interface Timed {
  date: number
  dueDate: number
  allDay: boolean
}

export interface Slot {
  start: number
  end: number
}

export interface CalEvent extends Timed {
  _id: string
  eventId: string
  title: string
  user: string
  calendar: string
  access: string
  participants: string[]
  blockTime: boolean
  visibility?: Visibility
  recurringEventId?: string
  originalStartTime?: number
  virtual?: boolean
  servoneRsvp?: string
  servoneRsvpOccurrences?: string
  servoneRsvpNote?: string
  servoneRsvpProposal?: string
  servoneGuestsCanModify?: boolean
  servoneGuestsCanInvite?: boolean
  servoneGuestsCanSeeGuests?: boolean
}

export interface Rule {
  freq: string
  interval?: number
  count?: number
  endDate?: number
  byDay?: string[]
}
