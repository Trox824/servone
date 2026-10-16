import type { Language } from '../workflows/templates'

export const DAY_MS = 24 * 60 * 60 * 1000
export const WINDOW_MS = 14 * DAY_MS
export const MAX_LATE_MS = 2 * DAY_MS
export const INVITEE_WAIT_MS = 3 * DAY_MS
export const IMPORT_TASK_THRESHOLD = 5
export const POLL_INTERVAL_MS = 10 * 60 * 1000
export const MAX_INVITES_PER_REQUEST = 50

export type StepKind = 'teammate' | 'invitee' | 'import' | 'founder'

export interface Step {
  id: string
  kind: StepKind
  dueAt: number
  invitee?: string
}

export interface StoredInvite {
  id: string
  email: string
  at: number
}

const WORKSPACE_STEPS: Array<{ id: string, kind: StepKind, afterMs: number }> = [
  { id: 'teammate-1d', kind: 'teammate', afterMs: DAY_MS },
  { id: 'import-4d', kind: 'import', afterMs: 4 * DAY_MS },
  { id: 'founder-10d', kind: 'founder', afterMs: 10 * DAY_MS }
]

export function planSteps (createdOn: number, invites: StoredInvite[]): Step[] {
  const workspaceSteps = WORKSPACE_STEPS.map((step): Step => ({ id: step.id, kind: step.kind, dueAt: createdOn + step.afterMs }))
  const inviteSteps = invites.map((invite): Step => ({ id: `invitee-${invite.id}`, kind: 'invitee', dueAt: invite.at + INVITEE_WAIT_MS, invitee: invite.email }))
  return [...workspaceSteps, ...inviteSteps].filter((step) => step.dueAt <= createdOn + WINDOW_MS)
}

export interface MailContext {
  firstName: string
  workspaceName: string
  invitee?: string
  url: string
}

interface MailCopy {
  subject: (context: MailContext) => string
  body: (context: MailContext) => string
  action: string
}

const FOUNDER_SIGNATURE = 'Hung, Servone founder'

export const COPY: Record<Language, Record<StepKind, MailCopy>> = {
  en: {
    teammate: {
      subject: () => 'Your workspace has one person in it',
      body: ({ firstName, workspaceName }) => `Hi ${firstName},\n\n${workspaceName} has only you in it so far. Servone works best when the people you work with see the same tasks, so invite one teammate today.`,
      action: 'Copy invite link'
    },
    invitee: {
      subject: ({ invitee }) => `${invitee ?? ''} has not joined yet`,
      body: ({ firstName, workspaceName, invitee }) => `Hi ${firstName},\n\nYou invited ${invitee ?? ''} to ${workspaceName} 3 days ago and they have not joined yet. The email may be in a spam folder, or the 48-hour invite may have expired. Send a fresh one.`,
      action: 'Resend invite'
    },
    import: {
      subject: () => 'Bring your ClickUp tasks over in a few minutes',
      body: ({ firstName, workspaceName }) => `Hi ${firstName},\n\nIf your team's tasks still live in ClickUp, you can bring them into ${workspaceName} in a few minutes. Your projects and tasks come across, and you can invite the people who work on them.`,
      action: 'Import from ClickUp'
    },
    founder: {
      subject: () => 'How is Servone working for your team?',
      body: ({ firstName, workspaceName }) => `Hi ${firstName},\n\nYou started ${workspaceName} 10 days ago. How is Servone working for your team so far? What is getting in the way, and what is missing?\n\nJust reply to this email. It comes to me and I read every answer.\n\n${FOUNDER_SIGNATURE}`,
      action: 'Reply'
    }
  },
  vi: {
    teammate: {
      subject: () => 'Không gian làm việc của bạn mới chỉ có một người',
      body: ({ firstName, workspaceName }) => `Chào ${firstName},\n\n${workspaceName} hiện mới chỉ có mình bạn. Servone hữu ích nhất khi cả nhóm cùng xem một danh sách việc, nên hãy mời một đồng đội ngay hôm nay.`,
      action: 'Sao chép link mời'
    },
    invitee: {
      subject: ({ invitee }) => `${invitee ?? ''} chưa tham gia`,
      body: ({ firstName, workspaceName, invitee }) => `Chào ${firstName},\n\nBạn đã mời ${invitee ?? ''} vào ${workspaceName} cách đây 3 ngày nhưng họ chưa tham gia. Email có thể nằm trong thư rác, hoặc lời mời 48 giờ đã hết hạn. Hãy gửi lại lời mời mới.`,
      action: 'Gửi lại lời mời'
    },
    import: {
      subject: () => 'Chuyển công việc từ ClickUp sang chỉ trong vài phút',
      body: ({ firstName, workspaceName }) => `Chào ${firstName},\n\nNếu công việc của nhóm vẫn nằm trong ClickUp, bạn có thể chuyển sang ${workspaceName} chỉ trong vài phút. Dự án và công việc được đưa sang, và bạn có thể mời luôn những người đang làm trong đó.`,
      action: 'Nhập từ ClickUp'
    },
    founder: {
      subject: () => 'Servone có đang phù hợp với nhóm của bạn không?',
      body: ({ firstName, workspaceName }) => `Chào ${firstName},\n\nBạn đã dùng ${workspaceName} được 10 ngày. Servone đang giúp nhóm bạn thế nào? Điều gì đang vướng, và còn thiếu gì?\n\nBạn chỉ cần trả lời email này. Thư sẽ đến thẳng chỗ mình và mình đọc từng phản hồi.\n\n${FOUNDER_SIGNATURE}`,
      action: 'Trả lời email này'
    }
  }
}

export interface LifecycleMail {
  to: string[]
  subject: string
  text: string
  headers: Record<string, string>
}

export function actionUrl (frontUrl: string, workspaceUrl: string, kind: StepKind): string | undefined {
  if (kind === 'import') return `${frontUrl}/workbench/${workspaceUrl}/setting/import`
  if (kind === 'founder') return undefined
  return `${frontUrl}/workbench/${workspaceUrl}/setting/invites`
}

export function buildMail (language: Language, step: Step, context: Omit<MailContext, 'url' | 'invitee'> & { frontUrl: string, workspaceUrl: string }, to: string, founderEmail: string): LifecycleMail {
  const copy = COPY[language][step.kind]
  const url = actionUrl(context.frontUrl, context.workspaceUrl, step.kind)
  const mailContext: MailContext = { firstName: context.firstName, workspaceName: context.workspaceName, invitee: step.invitee, url: url ?? '' }
  const body = copy.body(mailContext)
  const text = url === undefined ? body : `${body}\n\n${copy.action}: ${url}`
  const headers: Record<string, string> = step.kind === 'founder' ? { 'Reply-To': founderEmail } : {}
  return { to: [to], subject: copy.subject(mailContext), text, headers }
}
