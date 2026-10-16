import type { WorkspaceUuid } from '@hcengineering/core'
import type { Language } from '../workflows/templates'
import { buildMail, IMPORT_TASK_THRESHOLD, MAX_LATE_MS, planSteps, type LifecycleMail, type Step } from './plan'
import type { LifecycleStore } from './store'

export interface LifecycleWorkspace {
  uuid: WorkspaceUuid
  name: string
  url: string
  createdOn: number
}

export interface Creator {
  email: string | undefined
  firstName: string
  language: Language
}

export interface WorkspaceFacts {
  hasTeammate: () => Promise<boolean>
  outsideTaskCount: () => Promise<number>
  hasJoined: (email: string) => Promise<boolean>
  creator: () => Promise<Creator>
}

export interface LifecycleDeps {
  store: Pick<LifecycleStore, 'isDone' | 'markDone' | 'release' | 'listInvites'>
  sendMail: (mail: LifecycleMail) => Promise<boolean>
  frontUrl: string
  founderEmail: string
}

async function isStillNeeded (step: Step, facts: WorkspaceFacts): Promise<boolean> {
  if (step.kind === 'teammate') return !(await facts.hasTeammate())
  if (step.kind === 'import') return (await facts.outsideTaskCount()) < IMPORT_TASK_THRESHOLD
  if (step.kind === 'invitee') return step.invitee !== undefined && !(await facts.hasJoined(step.invitee))
  return true
}

export async function runWorkspace (deps: LifecycleDeps, workspace: LifecycleWorkspace, facts: WorkspaceFacts, now: number): Promise<number> {
  const invites = await deps.store.listInvites(workspace.uuid)
  let sentCount = 0
  for (const step of planSteps(workspace.createdOn, invites)) {
    if (step.dueAt > now || await deps.store.isDone(workspace.uuid, step.id)) continue
    const isLate = now - step.dueAt > MAX_LATE_MS
    const creator = isLate ? undefined : await facts.creator()
    if (creator?.email === undefined || !(await isStillNeeded(step, facts))) {
      await deps.store.markDone(workspace.uuid, step.id, { outcome: 'skipped', at: now })
      continue
    }
    const mail = buildMail(
      creator.language,
      step,
      { firstName: creator.firstName, workspaceName: workspace.name, frontUrl: deps.frontUrl, workspaceUrl: workspace.url },
      creator.email,
      deps.founderEmail
    )
    await deps.store.markDone(workspace.uuid, step.id, { outcome: 'sent', at: now })
    try {
      if (!(await deps.sendMail(mail))) throw new Error('Mail service refused the message')
    } catch (error) {
      await deps.store.release(workspace.uuid, step.id)
      throw error
    }
    sentCount++
  }
  return sentCount
}
