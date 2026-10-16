import type { Lang, Timed } from './types'

export interface DueIssue {
  _id: string
  title: string
  dueDate: number | null
  subIssues: number
  status: string
}

export interface DeadlineItem extends Timed {
  _id: string
  title: string
}

const DUE: Record<Lang, string> = { vi: 'Hạn', en: 'Due' }

export function deadlineItems (issues: DueIssue[], isClosed: (status: string) => boolean, lang: Lang): DeadlineItem[] {
  return issues.flatMap((issue) => {
    if (issue.dueDate === null || issue.subIssues > 0 || isClosed(issue.status)) return []
    const due = new Date(issue.dueDate)
    const [year, month, day] = [due.getFullYear(), due.getMonth(), due.getDate()]
    return [{
      _id: issue._id,
      title: `${DUE[lang]}: ${issue.title}`,
      allDay: true,
      date: Date.UTC(year, month, day),
      dueDate: Date.UTC(year, month, day, 23, 59, 59, 999)
    }]
  })
}
