import { firstFreeDay, jobAction, jobDraft, JOB_TEMPLATES, notifiedNow, shiftWorkingDays } from '../onboarding'

const MON = { year: 2026, month: 10, day: 2 }

describe('shiftWorkingDays', () => {
  it('counts back over a weekend', () => {
    expect(shiftWorkingDays(MON, -1)).toEqual({ year: 2026, month: 9, day: 30 })
    expect(shiftWorkingDays(MON, -3)).toEqual({ year: 2026, month: 9, day: 28 })
  })

  it('counts forward a working week', () => {
    expect(shiftWorkingDays(MON, 5)).toEqual({ year: 2026, month: 10, day: 9 })
  })

  it('moves a weekend day itself to the next Monday at offset 0', () => {
    expect(shiftWorkingDays({ year: 2026, month: 10, day: 1 }, 0)).toEqual(MON)
  })

  it('moves a weekend day back to Friday for a negative offset', () => {
    expect(shiftWorkingDays({ year: 2026, month: 10, day: 1 }, -1)).toEqual({ year: 2026, month: 9, day: 30 })
  })
})

const localDayOf = (t: number): [number, number, number, number] => {
  const d = new Date(t)
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]
}

describe('jobDraft', () => {
  const base = { personName: 'Lan Nguyen', person: 'lan', admin: 'admin', day: MON }

  it('titles the job after the person in the starter language', () => {
    expect(jobDraft({ ...base, kind: 'onboarding', manager: 'minh', language: 'vi' }).title).toBe('Nhận việc: Lan Nguyen')
    expect(jobDraft({ ...base, kind: 'offboarding', manager: 'minh', language: 'en' }).title).toBe('Offboarding: Lan Nguyen')
  })

  it('assigns each step to its role: manager, admin or the person', () => {
    const job = jobDraft({ ...base, kind: 'onboarding', manager: 'minh', language: 'en' })
    expect(job.assignee).toBe('minh')
    expect(job.steps.map((step) => [step.title, step.assignee])).toEqual([
      ['Create account and email', 'admin'],
      ['Prepare laptop and equipment', 'admin'],
      ['Plan the first week', 'minh'],
      ['Introduce to the team', 'minh'],
      ['Add photo and job title in Servone', 'lan'],
      ['First-week check-in', 'minh']
    ])
  })

  it('gives manager steps to the admin when nobody manages the person', () => {
    const job = jobDraft({ ...base, kind: 'offboarding', manager: undefined, language: 'vi' })
    expect(job.assignee).toBe('admin')
    expect(job.steps.every((step) => step.assignee !== undefined)).toBe(true)
    expect(job.steps.filter((step) => step.assignee === 'admin')).toHaveLength(4)
  })

  it('dates steps in working days from the day, due at the end of that local day', () => {
    const job = jobDraft({ ...base, kind: 'onboarding', manager: 'minh', language: 'en' })
    expect(job.steps.map((step) => localDayOf(step.dueDate))).toEqual([
      [2026, 10, 28, 23],
      [2026, 10, 30, 23],
      [2026, 10, 30, 23],
      [2026, 11, 2, 23],
      [2026, 11, 2, 23],
      [2026, 11, 9, 23]
    ])
    expect(localDayOf(job.startDate)).toEqual([2026, 11, 2, 0])
    expect(job.dueDate).toBe(job.steps[5].dueDate)
  })

  it('offboards to the last day, ending with access removed', () => {
    const job = jobDraft({ ...base, kind: 'offboarding', manager: 'minh', language: 'vi' })
    expect(job.steps.map((step) => step.title)).toEqual([
      'Bàn giao công việc',
      'Chuyển giao việc và tài liệu đang phụ trách',
      'Trao đổi trước khi nghỉ',
      'Thu hồi thiết bị',
      'Thu hồi quyền truy cập'
    ])
    expect(localDayOf(job.dueDate)).toEqual([2026, 11, 2, 23])
  })
})

describe('held step', () => {
  const base = { personName: 'Lan Nguyen', person: 'lan', admin: 'admin', day: MON, manager: 'minh', language: 'en' as const }

  it('leaves the leaving person\'s own step unassigned and held', () => {
    const job = jobDraft({ ...base, kind: 'offboarding' })
    expect(job.steps.map((step) => [step.title, step.assignee, step.isHeld])).toEqual([
      ['Hand over work', null, true],
      ['Reassign their work and documents', 'minh', false],
      ['Exit conversation', 'minh', false],
      ['Collect equipment', 'admin', false],
      ['Remove access', 'admin', false]
    ])
  })

  it('assigns a new hire their own step right away', () => {
    const job = jobDraft({ ...base, kind: 'onboarding' })
    expect(job.steps.some((step) => step.isHeld)).toBe(false)
    expect(job.steps.map((step) => step.assignee)).toContain('lan')
  })

  it('notifies only owners of steps that are not held, once each', () => {
    expect(notifiedNow(jobDraft({ ...base, kind: 'offboarding' }))).toEqual(['minh', 'admin'])
    expect(notifiedNow(jobDraft({ ...base, kind: 'onboarding' }))).toEqual(['admin', 'minh', 'lan'])
  })
})

describe('jobAction', () => {
  const onboardingOpen = { kind: 'onboarding' as const, isOpen: true }
  const onboardingDone = { kind: 'onboarding' as const, isOpen: false }
  const offboardingOpen = { kind: 'offboarding' as const, isOpen: true }

  it('opens the open job of that kind instead of starting a duplicate', () => {
    expect(jobAction('onboarding', [onboardingDone, onboardingOpen])).toEqual({ action: 'open', job: onboardingOpen })
    expect(jobAction('offboarding', [onboardingOpen, offboardingOpen])).toEqual({ action: 'open', job: offboardingOpen })
  })

  it('starts when the person has no job of that kind', () => {
    expect(jobAction('onboarding', [])).toEqual({ action: 'start' })
    expect(jobAction('offboarding', [onboardingOpen])).toEqual({ action: 'start' })
  })

  it('hides onboarding once a past onboarding job is closed', () => {
    expect(jobAction('onboarding', [onboardingDone])).toEqual({ action: 'none' })
  })

  it('still offers offboarding after a closed one, for someone who returned', () => {
    expect(jobAction('offboarding', [{ kind: 'offboarding', isOpen: false }])).toEqual({ action: 'start' })
  })
})

describe('step lists', () => {
  it('stay out of contracts, pay and paperwork (PRODUCT.md scope)', () => {
    const titles = Object.values(JOB_TEMPLATES).flatMap((template) => template.steps.flatMap((step) => [step.title.vi, step.title.en]))
    expect(titles.filter((title) => /contract|salary|payroll|insurance|paperwork|hợp đồng|lương|bảo hiểm|giấy tờ/i.test(title))).toEqual([])
  })
})

describe('firstFreeDay', () => {
  const FRI = { year: 2026, month: 9, day: 2 }

  it('is the earliest day whose first step is not already overdue', () => {
    expect(firstFreeDay('onboarding', FRI)).toEqual({ year: 2026, month: 9, day: 7 })
    expect(firstFreeDay('offboarding', FRI)).toEqual({ year: 2026, month: 9, day: 9 })
  })
})
