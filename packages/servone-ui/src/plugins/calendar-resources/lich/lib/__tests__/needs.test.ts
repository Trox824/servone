import { dueState, needsYou, NO_PARENT, type NeedIssue } from '../needs'

const local = (y: number, m: number, d: number, h = 0): number => new Date(y, m - 1, d, h).getTime()
const NOW = local(2026, 10, 2, 10)
const WORKFLOW = 'wf-space'

function issue (id: string, dueDate: number | null, overrides: Partial<NeedIssue> = {}): NeedIssue {
  return { _id: id, title: id, dueDate, space: 'tracker-space', attachedTo: NO_PARENT, ...overrides }
}
const step = (id: string, dueDate: number | null): NeedIssue => issue(id, dueDate, { space: WORKFLOW, attachedTo: 'job' })

function run (input: Partial<Parameters<typeof needsYou>[0]>): string[] {
  return needsYou({ requests: [], issues: [], invites: [], workflowSpaces: new Set([WORKFLOW]), now: NOW, ...input })
    .map((need) => `${need.kind}:${need.doc._id}`)
}

describe('needsYou', () => {
  it('puts overdue first, then approvals, then by due time (the SRV-149 scenario)', () => {
    expect(run({
      requests: [{ _id: 'leave', createdOn: local(2026, 10, 1) }],
      issues: [step('onboard', local(2026, 10, 2, 17)), issue('late', local(2026, 9, 29))]
    })).toEqual(['task:late', 'approval:leave', 'step:onboard'])
  })

  it('keeps tasks due today or earlier and drops later ones', () => {
    expect(run({ issues: [issue('today', local(2026, 10, 2, 23)), issue('tomorrow', local(2026, 10, 3)), issue('none', null)] }))
      .toEqual(['task:today'])
  })

  it('keeps workflow steps whatever their due date, undated last', () => {
    expect(run({ issues: [step('undated', null), step('next-week', local(2026, 10, 9)), step('today', local(2026, 10, 2, 12))] }))
      .toEqual(['step:today', 'step:next-week', 'step:undated'])
  })

  it('treats a top-level workflow item as a task', () => {
    expect(run({ issues: [issue('ticket', local(2026, 10, 3), { space: WORKFLOW }), issue('due', local(2026, 10, 2), { space: WORKFLOW })] }))
      .toEqual(['task:due'])
  })

  it('orders approvals oldest first and slots invites by start', () => {
    expect(run({
      requests: [{ _id: 'new', createdOn: local(2026, 10, 2) }, { _id: 'old', createdOn: local(2026, 9, 28) }],
      invites: [{ _id: 'standup', date: local(2026, 10, 2, 14) }],
      issues: [issue('task', local(2026, 10, 2, 9))]
    })).toEqual(['approval:old', 'approval:new', 'task:task', 'invite:standup'])
  })
})

describe('dueState', () => {
  it('counts whole days overdue', () => {
    expect(dueState(local(2026, 9, 29, 18), NOW)).toEqual({ kind: 'overdue', days: 3 })
    expect(dueState(local(2026, 10, 1, 23), NOW)).toEqual({ kind: 'overdue', days: 1 })
  })

  it('names today, tomorrow and later', () => {
    expect(dueState(local(2026, 10, 2, 8), NOW)).toEqual({ kind: 'today' })
    expect(dueState(local(2026, 10, 3, 8), NOW)).toEqual({ kind: 'tomorrow' })
    expect(dueState(local(2026, 10, 9), NOW)).toEqual({ kind: 'later' })
    expect(dueState(undefined, NOW)).toEqual({ kind: 'none' })
  })
})
