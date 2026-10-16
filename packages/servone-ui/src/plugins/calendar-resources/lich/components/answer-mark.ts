import { CircleCheck, CircleDashed, CircleHelp, CircleX, Crown } from '@lucide/svelte'
import type { Answer } from '../lib/rsvp'
import type { StringKey } from '../strings'

export const ANSWER_MARK: Record<Answer, { icon: typeof CircleCheck, label: StringKey, tone: string }> = {
  organizer: { icon: Crown, label: 'Organizer', tone: 'text-muted-foreground' },
  accepted: { icon: CircleCheck, label: 'Yes', tone: 'text-primary' },
  declined: { icon: CircleX, label: 'No', tone: 'text-destructive' },
  tentative: { icon: CircleHelp, label: 'Maybe', tone: 'text-muted-foreground' },
  pending: { icon: CircleDashed, label: 'NoReply', tone: 'text-muted-foreground' },
  none: { icon: CircleDashed, label: 'NoReply', tone: 'text-muted-foreground' }
}
