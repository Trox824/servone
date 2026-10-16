import { datesFromHistory, datesUpdate, planDates, settledDates, type StatusHistory } from '../dates'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const d0 = new Date(2026, 9, 1).getTime()
const at = (days: number, hours = 12): number => d0 + days * DAY + hours * HOUR

describe('planDates', () => {
  it('dates an issue created in Done with its creation time and no start', () => {
    expect(planDates({}, 'done', { kind: 'done', at: at(0) })).toEqual({
      kind: 'write',
      update: { respondedOn: at(0), completedOn: at(0) }
    })
  })

  it('starts on the first move to an active status and completes on the move to done', () => {
    expect(planDates({ respondedOn: at(0) }, 'active', { kind: 'active', at: at(1) })).toEqual({
      kind: 'write',
      update: { startedOn: at(1) }
    })
    expect(planDates({ respondedOn: at(0), startedOn: at(1) }, 'done', { kind: 'done', at: at(3) })).toEqual({
      kind: 'write',
      update: { completedOn: at(3) }
    })
  })

  it('keeps the first start when the issue is started again', () => {
    expect(planDates({ respondedOn: at(1), startedOn: at(1) }, 'active', { kind: 'active', at: at(4) })).toEqual({ kind: 'none' })
  })

  it('clears the completion when the issue is reopened', () => {
    expect(planDates({ respondedOn: at(1), startedOn: at(1), completedOn: at(3) }, 'active', { kind: 'active', at: at(4) })).toEqual({
      kind: 'write',
      update: { completedOn: null }
    })
  })

  it('clears the completion when a done issue is canceled', () => {
    expect(planDates({ respondedOn: at(3), completedOn: at(3) }, 'canceled', { kind: 'canceled', at: at(4) })).toEqual({
      kind: 'write',
      update: { completedOn: null }
    })
  })

  it('asks for history when a done event is newer than the stored date', () => {
    expect(planDates({ completedOn: at(3) }, 'done', { kind: 'done', at: at(5) })).toEqual({ kind: 'history' })
  })

  it('changes nothing when an old done event is replayed', () => {
    expect(planDates({ respondedOn: at(1), startedOn: at(1), completedOn: at(5) }, 'done', { kind: 'done', at: at(3) })).toEqual({ kind: 'none' })
  })

  it('responds on the first move out of the backlog, whatever the category', () => {
    expect(planDates({}, 'todo', { kind: 'todo', at: at(1) })).toEqual({ kind: 'write', update: { respondedOn: at(1) } })
    expect(planDates({}, 'canceled', { kind: 'canceled', at: at(1) })).toEqual({ kind: 'write', update: { respondedOn: at(1) } })
    expect(planDates({}, 'done', { kind: 'done', at: at(1) })).toEqual({
      kind: 'write',
      update: { respondedOn: at(1), completedOn: at(1) }
    })
    expect(planDates({}, 'active', { kind: 'active', at: at(1) })).toEqual({
      kind: 'write',
      update: { respondedOn: at(1), startedOn: at(1) }
    })
  })

  it('does not respond on a move to the backlog', () => {
    expect(planDates({}, 'unstarted', { kind: 'unstarted', at: at(1) })).toEqual({ kind: 'none' })
  })

  it('never moves the response later, but an earlier replayed event moves it earlier', () => {
    expect(planDates({ respondedOn: at(1) }, 'todo', { kind: 'todo', at: at(2) })).toEqual({ kind: 'none' })
    expect(planDates({ respondedOn: at(2) }, 'todo', { kind: 'todo', at: at(1) })).toEqual({
      kind: 'write',
      update: { respondedOn: at(1) }
    })
  })

  it('keeps the response when the issue is reopened or sent back to the backlog', () => {
    expect(
      planDates({ respondedOn: at(1), completedOn: at(3) }, 'active', { kind: 'active', at: at(4) })
    ).toEqual({ kind: 'write', update: { startedOn: at(4), completedOn: null } })
    expect(planDates({ respondedOn: at(1) }, 'unstarted', { kind: 'unstarted', at: at(4) })).toEqual({ kind: 'none' })
  })

  it('asks for history when the issue is done but a late non-done event has no date to go on', () => {
    expect(planDates({}, 'done', { kind: 'active', at: at(2) })).toEqual({ kind: 'history' })
    expect(planDates({ startedOn: at(2) }, 'done', { kind: 'todo', at: at(2) })).toEqual({ kind: 'history' })
  })
})

function history (over: Partial<StatusHistory>): StatusHistory {
  return { created: d0 - DAY, initial: 'todo', changes: [], ...over }
}

// Same fixtures as cycleTimes() in packages/servone-ui/.../sprints/lib/__tests__/flow.test.ts.
describe('datesFromHistory', () => {
  it('measures first start to last done', () => {
    expect(
      datesFromHistory(history({ changes: [{ at: at(0), kind: 'active' }, { at: at(1), kind: 'done' }] }))
    ).toEqual({ startedOn: at(0), completedOn: at(1) })
  })

  it('leaves no completion for work reopened after done', () => {
    expect(
      datesFromHistory(
        history({ changes: [{ at: at(0), kind: 'active' }, { at: at(1), kind: 'done' }, { at: at(2), kind: 'active' }] })
      )
    ).toEqual({ startedOn: at(0) })
  })

  it('leaves no start for work that went straight to done', () => {
    expect(datesFromHistory(history({ created: at(0), changes: [{ at: at(3), kind: 'done' }] }))).toEqual({
      completedOn: at(3)
    })
  })

  it('uses the last move to done after a reopen', () => {
    expect(
      datesFromHistory(
        history({
          changes: [
            { at: at(0), kind: 'active' },
            { at: at(1), kind: 'done' },
            { at: at(2), kind: 'active' },
            { at: at(4), kind: 'done' }
          ]
        })
      )
    ).toEqual({ startedOn: at(0), completedOn: at(4) })
  })

  it('keeps the date across a move between two done statuses', () => {
    expect(
      datesFromHistory(history({ changes: [{ at: at(1), kind: 'done' }, { at: at(2), kind: 'done' }] }))
    ).toEqual({ completedOn: at(1) })
  })

  it('counts an issue created in an active or done status from its creation', () => {
    expect(datesFromHistory(history({ created: at(0), initial: 'active' }))).toEqual({ startedOn: at(0) })
    expect(datesFromHistory(history({ created: at(0), initial: 'done' }))).toEqual({ completedOn: at(0) })
  })

  it('sorts changes by time', () => {
    expect(
      datesFromHistory(history({ changes: [{ at: at(2), kind: 'done' }, { at: at(1), kind: 'active' }] }))
    ).toEqual({ startedOn: at(1), completedOn: at(2) })
  })
})

describe('settledDates', () => {
  const issue = { createdOn: at(0), modifiedOn: at(3) }

  it('takes the dates from history when there is one', () => {
    const derived = history({ created: at(0), changes: [{ at: at(1), kind: 'active' }, { at: at(2), kind: 'done' }] })
    expect(settledDates(derived, 'done', issue)).toEqual({ dates: { startedOn: at(1), completedOn: at(2) }, isEstimated: false })
  })

  it('estimates an issue without history from its creation and last change', () => {
    expect(settledDates(undefined, 'done', issue)).toEqual({ dates: { startedOn: at(0), completedOn: at(3) }, isEstimated: true })
    expect(settledDates(undefined, 'active', issue)).toEqual({ dates: { startedOn: at(0) }, isEstimated: true })
    expect(settledDates(undefined, 'todo', issue)).toEqual({ dates: {}, isEstimated: false })
  })

  it('follows the current category when history disagrees', () => {
    const endsActive = history({ created: at(0), changes: [{ at: at(1), kind: 'active' }] })
    expect(settledDates(endsActive, 'done', issue)).toEqual({ dates: { startedOn: at(1), completedOn: at(3) }, isEstimated: true })
    const endsDone = history({ created: at(0), changes: [{ at: at(2), kind: 'done' }] })
    expect(settledDates(endsDone, 'todo', issue)).toEqual({ dates: {}, isEstimated: false })
    const neverActive = history({ created: at(0), changes: [{ at: at(2), kind: 'todo' }] })
    expect(settledDates(neverActive, 'active', issue)).toEqual({ dates: { startedOn: at(0) }, isEstimated: true })
  })
})

describe('datesUpdate', () => {
  it('writes only what differs and unsets a date the target lacks', () => {
    expect(datesUpdate({ startedOn: at(0), completedOn: at(2) }, { startedOn: at(0), completedOn: at(4) })).toEqual({
      completedOn: at(4)
    })
    expect(datesUpdate({ startedOn: at(0), completedOn: at(2) }, { startedOn: at(0) })).toEqual({ completedOn: null })
    expect(datesUpdate({ startedOn: at(0) }, { startedOn: at(0) })).toBeUndefined()
  })

  it('never clears a start date', () => {
    expect(datesUpdate({ startedOn: at(0) }, {})).toBeUndefined()
  })
})
