import { parseHelpdeskSettings, slaToJson, type Sla } from '../helpdesk'

const since = new Date(2026, 8, 29).getTime()

// The IT Helpdesk template's targets.
const templateSla: Sla = {
  since,
  targets: {
    urgent: { respondHours: 1, resolveHours: 4 },
    high: { respondHours: 4, resolveHours: 24 },
    medium: { respondHours: 24, resolveHours: 72 },
    low: { respondHours: 48, resolveHours: 120 }
  }
}

describe('parseHelpdeskSettings', () => {
  it('round-trips the template settings', () => {
    expect(
      parseHelpdeskSettings({ servoneSla: slaToJson(templateSla), servoneAutoCloseDays: 3, servoneAutoArchiveMonths: 6 })
    ).toEqual({ sla: templateSla, autoCloseDays: 3, autoArchiveMonths: 6 })
  })

  it('is all off for a project without settings', () => {
    expect(parseHelpdeskSettings({})).toEqual({})
  })

  it.each([
    ['malformed JSON', '{"since":'],
    ['a non-object', '42'],
    ['no since', JSON.stringify({ targets: templateSla.targets })],
    ['no targets', JSON.stringify({ since })],
    ['empty targets', JSON.stringify({ since, targets: {} })],
    ['only unknown priorities', JSON.stringify({ since, targets: { critical: { respondHours: 1 } } })]
  ])('reads %s as no SLA', (_name, servoneSla) => {
    expect(parseHelpdeskSettings({ servoneSla })).toEqual({})
  })

  it('drops unknown priorities and hours that are not positive integers', () => {
    const servoneSla = JSON.stringify({
      since,
      targets: {
        urgent: { respondHours: -1, resolveHours: 4 },
        high: { respondHours: 1.5, resolveHours: '24' },
        medium: { respondHours: 0 },
        critical: { respondHours: 1 }
      }
    })
    expect(parseHelpdeskSettings({ servoneSla })).toEqual({ sla: { since, targets: { urgent: { resolveHours: 4 } } } })
  })

  it.each([0, 2, 12.5, -3, '6', null])('reads auto-archive %p months as off', (servoneAutoArchiveMonths) => {
    expect(parseHelpdeskSettings({ servoneAutoArchiveMonths })).toEqual({})
  })

  it.each([0, -1, 1.5, '3', null])('reads auto-close %p days as off', (servoneAutoCloseDays) => {
    expect(parseHelpdeskSettings({ servoneAutoCloseDays })).toEqual({})
  })
})
