import type { CollaboratorClient } from '@hcengineering/collaborator-client'
import core, {
  generateId,
  makeCollabId,
  SortingOrder,
  type MarkupBlobRef,
  type TxOperations
} from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import tags from '@hcengineering/tags'
import task, { type TaskType } from '@hcengineering/task'
import { isEmptyNode, jsonToMarkup, markupToJSON } from '@hcengineering/text-core'
import tracker, { type Project } from '@hcengineering/tracker'
import {
  composeDescription,
  fillIssue,
  formIssueClass,
  recordAnswers,
  serializeFormRecord,
  templateForm,
  viaFormLabel,
  writeFormExtras,
  type Answer,
  type FormIssue,
  type FormTemplate
} from '@servone/forms'
import { z } from 'zod'
import { withTimeout } from '../mcp/collab'
import { initialStatus, notifyTriageOwner } from '../tracker/issues'

export interface FormSession {
  // Signs the issue as the forms bot.
  bot: TxOperations
  // Creates the shared "via form" label, which the bot's User role may not be allowed to do.
  system: TxOperations
  collaborator: CollaboratorClient
}

const sequenceBump = z.object({ object: z.object({ sequence: z.number().int() }) })

async function formTaskType (client: TxOperations, project: Project, template: FormTemplate): Promise<TaskType> {
  const kinds = await client.findAll(task.class.TaskType, { parent: project.type })
  const kind = kinds.find((candidate) => candidate._id === template.kind) ?? kinds[0]
  if (kind === undefined) throw new Error(`Project ${project.identifier} has no task types`)
  return kind
}

// Mirrors the create issue dialog with the template applied, then lets the answers override it.
export async function fileIssueFromForm (session: FormSession, template: FormTemplate, answers: Answer[]): Promise<string> {
  const { bot } = session
  const project = await bot.findOne(tracker.class.Project, { _id: template.space })
  if (project === undefined) throw new Error(`Project of template ${template._id} is gone`)
  const kind = await formTaskType(bot, project, template)
  const status = await initialStatus(bot, project, kind, template.servoneFormStatus)
  const definition = templateForm(template)
  if (definition === undefined) throw new Error(`Template ${template._id} no longer has a form`)
  const fill = fillIssue(bot.getHierarchy(), kind.targetClass, answers)
  const label = await viaFormLabel(session.system)

  const bump = await bot.updateDoc(tracker.class.Project, core.space.Space, project._id, { $inc: { sequence: 1 } }, true)
  const number = sequenceBump.parse(bump).object.sequence
  const identifier = `${project.identifier}-${number}`
  const last = await bot.findOne(tracker.class.Issue, { space: project._id }, { sort: { rank: SortingOrder.Descending } })

  const id = generateId<FormIssue>()
  const templateBody = markupToJSON(template.description).content ?? []
  const document = composeDescription(fill, templateBody)
  let description: MarkupBlobRef | null = null
  if (!isEmptyNode(document)) {
    const collabId = makeCollabId(tracker.class.Issue, id, 'description')
    description = await withTimeout(session.collaborator.createMarkup(collabId, jsonToMarkup(document)))
  }

  await bot.addCollection(
    formIssueClass,
    project._id,
    tracker.ids.NoParent,
    tracker.class.Issue,
    'subIssues',
    {
      title: fill.title ?? template.title,
      description,
      assignee: template.assignee,
      component: template.component,
      milestone: template.milestone ?? null,
      number,
      status,
      priority: fill.priority ?? template.priority,
      rank: makeRank(last?.rank, undefined),
      comments: 0,
      subIssues: 0,
      startDate: null,
      dueDate: fill.dueDate ?? null,
      parents: [],
      remainingTime: 0,
      estimation: template.estimation,
      reportedTime: 0,
      reports: 0,
      childInfo: [],
      identifier,
      kind: kind._id,
      template: { template: template._id },
      servoneFormAnswers: serializeFormRecord(recordAnswers(definition, answers, template._id, Date.now()))
    },
    id
  )

  const templateLabels = await bot.findAll(tags.class.TagElement, { _id: { $in: template.labels ?? [] } })
  for (const templateLabel of templateLabels) {
    await bot.addCollection(tags.class.TagReference, project._id, id, tracker.class.Issue, 'labels', {
      title: templateLabel.title,
      color: templateLabel.color,
      tag: templateLabel._id
    })
  }
  await writeFormExtras(bot, id, project._id, fill, label)
  await notifyTriageOwner(bot, project, id, status)
  return identifier
}
