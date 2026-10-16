import { utcOf, type LeaveDay } from '../../../../lib/leave'

const DAY_MS = 24 * 60 * 60 * 1000
const SATURDAY = 6
const SUNDAY = 0

const isWeekend = (t: number): boolean => [SATURDAY, SUNDAY].includes(new Date(t).getUTCDay())

const dayOf = (t: number): LeaveDay => {
  const d = new Date(t)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() }
}

export function shiftWorkingDays (from: LeaveDay, offset: number): LeaveDay {
  const step = offset < 0 ? -DAY_MS : DAY_MS
  let t = utcOf(from)
  let left = Math.abs(offset)
  if (offset === 0) {
    while (isWeekend(t)) t += DAY_MS
    return dayOf(t)
  }
  while (left > 0) {
    t += step
    if (!isWeekend(t)) left--
  }
  return dayOf(t)
}

export type JobKind = 'onboarding' | 'offboarding'
export type Language = 'vi' | 'en'
type Text = Record<Language, string>
type OwnerRole = 'manager' | 'admin' | 'person'

interface StepTemplate {
  title: Text
  owner: OwnerRole
  offset: number
}

export const JOB_TEMPLATES = {
  onboarding: {
    key: 'nhan-viec',
    holdsPersonSteps: false,
    name: { vi: 'Nhận việc', en: 'Onboarding' },
    steps: [
      { title: { vi: 'Tạo tài khoản và email', en: 'Create account and email' }, owner: 'admin', offset: -3 },
      { title: { vi: 'Chuẩn bị máy tính và thiết bị', en: 'Prepare laptop and equipment' }, owner: 'admin', offset: -1 },
      { title: { vi: 'Lên kế hoạch tuần đầu', en: 'Plan the first week' }, owner: 'manager', offset: -1 },
      { title: { vi: 'Giới thiệu với nhóm', en: 'Introduce to the team' }, owner: 'manager', offset: 0 },
      { title: { vi: 'Cập nhật ảnh và chức danh trên Servone', en: 'Add photo and job title in Servone' }, owner: 'person', offset: 0 },
      { title: { vi: 'Trao đổi sau tuần đầu', en: 'First-week check-in' }, owner: 'manager', offset: 5 }
    ]
  },
  offboarding: {
    key: 'nghi-viec',
    holdsPersonSteps: true,
    name: { vi: 'Nghỉ việc', en: 'Offboarding' },
    steps: [
      { title: { vi: 'Bàn giao công việc', en: 'Hand over work' }, owner: 'person', offset: -5 },
      { title: { vi: 'Chuyển giao việc và tài liệu đang phụ trách', en: 'Reassign their work and documents' }, owner: 'manager', offset: -2 },
      { title: { vi: 'Trao đổi trước khi nghỉ', en: 'Exit conversation' }, owner: 'manager', offset: -1 },
      { title: { vi: 'Thu hồi thiết bị', en: 'Collect equipment' }, owner: 'admin', offset: 0 },
      { title: { vi: 'Thu hồi quyền truy cập', en: 'Remove access' }, owner: 'admin', offset: 0 }
    ]
  }
} as const satisfies Record<JobKind, { key: string, holdsPersonSteps: boolean, name: Text, steps: StepTemplate[] }>

export interface JobInput<P> {
  kind: JobKind
  person: P
  personName: string
  manager: P | undefined
  admin: P
  day: LeaveDay
  language: Language
}

export interface StepDraft<P> {
  title: string
  assignee: P | null
  isHeld: boolean
  dueDate: number
}

export interface JobDraft<P> {
  title: string
  assignee: P
  startDate: number
  dueDate: number
  steps: Array<StepDraft<P>>
}

const endOfDay = (d: LeaveDay): number => new Date(d.year, d.month, d.day, 23, 59, 59, 999).getTime()

export function jobDraft<P> (input: JobInput<P>): JobDraft<P> {
  const template = JOB_TEMPLATES[input.kind]
  const manager = input.manager ?? input.admin
  const owners: Record<OwnerRole, P> = { manager, admin: input.admin, person: input.person }
  const stepTemplates: readonly StepTemplate[] = template.steps
  const steps = stepTemplates.map((step) => {
    const isHeld = template.holdsPersonSteps && step.owner === 'person'
    return {
      title: step.title[input.language],
      assignee: isHeld ? null : owners[step.owner],
      isHeld,
      dueDate: endOfDay(shiftWorkingDays(input.day, step.offset))
    }
  })
  return {
    title: `${template.name[input.language]}: ${input.personName}`,
    assignee: manager,
    startDate: new Date(input.day.year, input.day.month, input.day.day).getTime(),
    dueDate: Math.max(...steps.map((step) => step.dueDate)),
    steps
  }
}

export function firstFreeDay (kind: JobKind, today: LeaveDay): LeaveDay {
  const stepTemplates: readonly StepTemplate[] = JOB_TEMPLATES[kind].steps
  return shiftWorkingDays(today, -Math.min(...stepTemplates.map((step) => step.offset)))
}

export function notifiedNow<P> (job: JobDraft<P>): P[] {
  return [...new Set(job.steps.flatMap((step) => (step.assignee === null ? [] : [step.assignee])))]
}

export type JobAction<J> = { action: 'open', job: J } | { action: 'start' } | { action: 'none' }

export function jobAction<J extends { kind: JobKind, isOpen: boolean }> (kind: JobKind, jobs: J[]): JobAction<J> {
  const ofKind = jobs.filter((job) => job.kind === kind)
  const open = ofKind.find((job) => job.isOpen)
  if (open !== undefined) return { action: 'open', job: open }
  if (kind === 'onboarding' && ofKind.length > 0) return { action: 'none' }
  return { action: 'start' }
}
