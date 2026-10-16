import { parseHandoff, parseHelpdeskSettings, slaToJson, type HelpdeskSettings, type Sla } from '@servone/notify-rules'
import { draftOf, helpdeskUpdate } from '../draft'

const since = new Date(2026, 8, 1).getTime()
const now = new Date(2026, 8, 29).getTime()

const templateSla: Sla = {
  since,
  targets: {
    urgent: { respondHours: 1, resolveHours: 4 },
    high: { respondHours: 4, resolveHours: 24 },
    medium: { respondHours: 24, resolveHours: 72 },
    low: { respondHours: 48, resolveHours: 120 }
  }
}
const template: HelpdeskSettings = { sla: templateSla, autoCloseDays: 3 }

describe('helpdeskUpdate', () => {
  it('keeps since when the targets did not change', () => {
    const draft = draftOf(template, undefined)
    draft.autoCloseDays = '5'
    draft.autoArchiveMonths = '6'
    expect(helpdeskUpdate(draft, template, now)).toEqual({
      servoneSla: slaToJson(templateSla),
      servoneAutoCloseDays: 5,
      servoneAutoArchiveMonths: 6,
      $unset: { servoneHandoff: true }
    })
  })

  it('restarts since on a target change and writes what the service reads', () => {
    const draft = draftOf(template, undefined)
    draft.targets.urgent.respond = '2'
    draft.targets.low = { respond: '', resolve: '' }
    const update = helpdeskUpdate(draft, template, now)
    expect(parseHelpdeskSettings(update)).toEqual({
      sla: {
        since: now,
        targets: {
          urgent: { respondHours: 2, resolveHours: 4 },
          high: { respondHours: 4, resolveHours: 24 },
          medium: { respondHours: 24, resolveHours: 72 }
        }
      },
      autoCloseDays: 3
    })
  })

  it('unsets every setting left empty', () => {
    const draft = draftOf({}, undefined)
    expect(helpdeskUpdate(draft, template, now)).toEqual({
      $unset: { servoneSla: true, servoneAutoCloseDays: true, servoneAutoArchiveMonths: true, servoneHandoff: true }
    })
  })

  it('refuses hours or days that are not whole positive numbers', () => {
    for (const text of ['0', '-1', '1.5', 'abc']) {
      const draft = draftOf(template, undefined)
      draft.autoCloseDays = text
      expect(helpdeskUpdate(draft, template, now)).toBeUndefined()
    }
  })

  it('writes a handoff rule the service reads', () => {
    const draft = draftOf(template, undefined)
    draft.handoff = { stage: 'approved', target: 'workflow-b', assignee: 'same', person: 'ignored' }
    expect(parseHandoff(helpdeskUpdate(draft, template, now) ?? {})).toEqual({
      stage: 'approved',
      target: 'workflow-b',
      assignee: { kind: 'same' }
    })
  })

  it('refuses a half-filled handoff rule', () => {
    const halves = [
      { stage: 'approved', target: '', assignee: 'none', person: '' },
      { stage: 'approved', target: 'workflow-b', assignee: 'person', person: '' }
    ] as const
    for (const handoff of halves) {
      const draft = draftOf(template, undefined)
      draft.handoff = { ...handoff }
      expect(helpdeskUpdate(draft, template, now)).toBeUndefined()
    }
  })
})
