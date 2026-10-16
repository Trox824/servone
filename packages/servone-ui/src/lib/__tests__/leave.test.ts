import { DEFAULT_ANNUAL_LEAVE_DAYS, annualAllowance, daysLeft, isOffOn, isPendingLeave, nextWorkingDay, pendingDays, workingDays, type Leave } from '../leave'

const day = (year: number, month: number, date: number): { year: number, month: number, day: number } => ({ year, month: month - 1, day: date })

describe('workingDays', () => {
  it('counts Friday to Monday as two days', () => {
    expect(workingDays(day(2026, 10, 2), day(2026, 10, 5), [])).toBe(2)
  })
  it('skips Reunification Day and Labour Day', () => {
    expect(workingDays(day(2026, 4, 27), day(2026, 5, 1), [day(2026, 4, 30), day(2026, 5, 1)])).toBe(3)
  })
  it('gives zero for a weekend', () => {
    expect(workingDays(day(2026, 10, 3), day(2026, 10, 4), [])).toBe(0)
  })
})

const leave = (approval: Leave['servoneApproval'], from: LeaveDayArgs, to: LeaveDayArgs, type = 'hr:ids:Vacation'): Leave => ({
  type,
  tzDate: day(...from),
  tzDueDate: day(...to),
  servoneApproval: approval
})
type LeaveDayArgs = [number, number, number]

describe('isOffOn', () => {
  const trip = leave('approved', [2026, 10, 5], [2026, 10, 7])
  it('covers the first and last day of an approved leave', () => {
    expect([isOffOn(trip, day(2026, 10, 5)), isOffOn(trip, day(2026, 10, 7))]).toEqual([true, true])
  })
  it('does not cover the day after', () => {
    expect(isOffOn(trip, day(2026, 10, 8))).toBe(false)
  })
  it('ignores pending, rejected and withdrawn leave', () => {
    const states = ['pending', 'rejected', 'withdrawn', undefined] as const
    expect(states.map((state) => isOffOn(leave(state, [2026, 10, 5], [2026, 10, 7]), day(2026, 10, 6)))).toEqual([false, false, false, false])
  })
})

describe('daysLeft', () => {
  it('starts the year at the 12-day labour code default', () => {
    expect(daysLeft(DEFAULT_ANNUAL_LEAVE_DAYS, [], 2026, [])).toBe(12)
  })
  it('subtracts the working days of approved annual leave', () => {
    expect(daysLeft(12, [leave('approved', [2026, 10, 1], [2026, 10, 5])], 2026, [])).toBe(9)
  })
  it('does not count rejected, pending or withdrawn leave', () => {
    const leaves = (['rejected', 'pending', 'withdrawn'] as const).map((state) => leave(state, [2026, 10, 1], [2026, 10, 2]))
    expect(daysLeft(12, leaves, 2026, [])).toBe(12)
  })
  it('does not count sick leave against the allowance', () => {
    expect(daysLeft(12, [leave('approved', [2026, 10, 1], [2026, 10, 2], 'hr:ids:Sick')], 2026, [])).toBe(12)
  })
  it('splits a leave across New Year between the two years', () => {
    const newYear = [leave('approved', [2026, 12, 29], [2027, 1, 4])]
    const holidays = [day(2027, 1, 1)]
    expect([daysLeft(12, newYear, 2026, holidays), daysLeft(12, newYear, 2027, holidays)]).toEqual([9, 11])
  })
  it('goes below zero instead of stopping at it', () => {
    expect(daysLeft(2, [leave('approved', [2026, 10, 5], [2026, 10, 9])], 2026, [])).toBe(-3)
  })
})

describe('annualAllowance', () => {
  it("uses the company's setting when it is a whole number of days", () => {
    expect(annualAllowance(14)).toBe(14)
  })
  it('falls back to 12 when unset or out of range', () => {
    expect([undefined, 0, -3, 2.5, 400].map(annualAllowance)).toEqual([12, 12, 12, 12, 12])
  })
})

describe('nextWorkingDay', () => {
  it('keeps a working day', () => {
    expect(nextWorkingDay(day(2026, 10, 1), [])).toEqual(day(2026, 10, 1))
  })
  it('moves Saturday past the weekend and a Monday holiday', () => {
    expect(nextWorkingDay(day(2026, 8, 29), [day(2026, 8, 31)])).toEqual(day(2026, 9, 1))
  })
})

describe('pendingDays', () => {
  it('counts working days of annual leave still awaiting a decision', () => {
    expect(pendingDays([leave('pending', [2026, 10, 1], [2026, 10, 5])], 2026, [])).toBe(3)
  })
  it('ignores decided, withdrawn and sick leave', () => {
    const leaves = [
      leave('approved', [2026, 10, 1], [2026, 10, 2]),
      leave('rejected', [2026, 10, 1], [2026, 10, 2]),
      leave('withdrawn', [2026, 10, 1], [2026, 10, 2]),
      leave('pending', [2026, 10, 1], [2026, 10, 2], 'hr:ids:Sick')
    ]
    expect(pendingDays(leaves, 2026, [])).toBe(0)
  })
  it('counts only the days inside the year asked for', () => {
    expect(pendingDays([leave('pending', [2026, 12, 31], [2027, 1, 4])], 2027, [day(2027, 1, 1)])).toBe(1)
  })
})

describe('isPendingLeave', () => {
  it('is true only while the engine marks it pending', () => {
    const states = ['pending', 'approved', 'rejected', 'withdrawn', undefined] as const
    expect(states.map((state) => isPendingLeave(leave(state, [2026, 10, 5], [2026, 10, 5])))).toEqual([true, false, false, false, false])
  })
})
