import { getCurrentEmployee, type Person } from '@hcengineering/contact'
import { AssigneePopup } from '@hcengineering/contact-resources'
import type { Doc, Ref, Status } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import task, { type Task } from '@hcengineering/task'
import { taskTypeStore, typeStore } from '@hcengineering/task-resources'
import { showPopup } from '@hcengineering/ui'
import { statusStore } from '@hcengineering/view-resources'
import { statusApproval } from '@servone/approvals/src/gate'
import { get } from 'svelte/store'
import { str } from '../../request-resources/strings'

function fieldGateAfter (item: Task, gate: Ref<Status>): string | undefined {
  const taskType = get(taskTypeStore).get(item.kind)
  const projectType = taskType === undefined ? undefined : get(typeStore).get(taskType.parent)
  if (taskType === undefined || projectType === undefined) return undefined
  const statuses = get(statusStore).byId
  const next = taskType.statuses
    .slice(taskType.statuses.indexOf(gate) + 1)
    .find((status) => statuses.get(status)?.category !== task.statusCategory.Lost)
  const rule = next === undefined ? undefined : statusApproval(projectType, next)
  return rule?.by === 'field' ? rule.attribute : undefined
}

export async function handoverAfter (itemId: Ref<Doc>, gate: Ref<Status>): Promise<{ current: Ref<Person> | undefined } | undefined> {
  const item = await getClient().findOne(task.class.Task, { _id: itemId as Ref<Task> })
  const attribute = item === undefined ? undefined : fieldGateAfter(item, gate)
  return item === undefined || attribute === undefined ? undefined : { current: Reflect.get(item, attribute) }
}

export function pickNext (anchor: HTMLElement, selected: Ref<Person> | undefined, onPick: (person: Ref<Person>) => void): void {
  const props = { docQuery: { active: true }, selected, ignoreUsers: [getCurrentEmployee()], allowDeselect: false, placeholder: str.PickNext }
  showPopup(AssigneePopup, props, anchor, (person: Person | undefined) => {
    if (person !== undefined) onPick(person._id)
  })
}
