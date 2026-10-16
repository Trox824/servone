import contact, { type Employee } from '@hcengineering/contact'
import { getAccountClient } from '@hcengineering/contact-resources'
import core, { type Ref, type TxOperations } from '@hcengineering/core'
import hr, { type Department } from '@hcengineering/hr'
import { addMember } from '../../../../lib/people/add-member'
import type { StaffRow } from './csv'
import { splitFullName, type ExistingPerson, type ImportPlan } from './plan'

export interface ImportOutcome {
  created: number
  updated: number
  failures: Array<{ row: StaffRow, error: Error }>
  remaining: number
}

export interface RunOptions {
  sendInvites: boolean
  signal: AbortSignal
  onProgress: (done: number) => void
}

export async function runImport (
  client: TxOperations,
  plan: ImportPlan<Ref<Employee>>,
  people: ReadonlyArray<ExistingPerson<Ref<Employee>>>,
  departments: readonly Department[],
  { sendInvites, signal, onProgress }: RunOptions
): Promise<ImportOutcome> {
  const departmentIds = new Map<string, Ref<Department>>(departments.map((dept) => [dept._id, dept._id]))
  for (const dept of plan.newDepartments) {
    const id = await client.createDoc(hr.class.Department, core.space.Workspace, {
      name: dept.name,
      description: '',
      parent: hr.ids.Head,
      members: [],
      teamLead: null,
      managers: []
    })
    departmentIds.set(dept.key, id)
  }

  const personIds = new Map(people.map((person) => [person.email, person._id]))
  const work = plan.rows.filter((planned) => planned.action !== 'unchanged')
  const outcome: ImportOutcome = { created: 0, updated: 0, failures: [], remaining: 0 }
  for (const [index, planned] of work.entries()) {
    if (signal.aborted) {
      outcome.remaining = work.length - index
      return outcome
    }
    onProgress(index)
    try {
      const department = departmentIds.get(planned.department) ?? hr.ids.Head
      if (planned.action === 'create') {
        const { firstName, lastName } = splitFullName(planned.row.name)
        const id = await addMember(
          client,
          getAccountClient(),
          { email: planned.row.email, firstName, lastName, position: planned.row.title === '' ? null : planned.row.title },
          sendInvites
        )
        await client.updateMixin(id, contact.class.Person, contact.space.Contacts, hr.mixin.Staff, { department })
        personIds.set(planned.row.email, id)
        outcome.created++
      } else {
        const id = planned.personId
        if (planned.changes.includes('title')) {
          await client.updateMixin(id, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, { position: planned.row.title })
        }
        if (planned.changes.includes('department')) {
          await client.updateMixin(id, contact.class.Person, contact.space.Contacts, hr.mixin.Staff, { department })
        }
        outcome.updated++
      }
    } catch (err) {
      outcome.failures.push({ row: planned.row, error: err instanceof Error ? err : new Error(String(err)) })
    }
  }
  onProgress(work.length)

  const spaces = new Map(departments.map((dept) => [dept._id, dept.space]))
  const updateDepartment = async (key: string, update: Partial<Pick<Department, 'teamLead' | 'parent'>>): Promise<void> => {
    const id = departmentIds.get(key)
    if (id === undefined) return
    await client.updateDoc(hr.class.Department, spaces.get(id) ?? core.space.Workspace, id, update)
  }
  for (const [key, email] of plan.heads) {
    const teamLead = personIds.get(email)
    if (teamLead !== undefined) await updateDepartment(key, { teamLead })
  }
  for (const [key, parent] of plan.parents) {
    const parentId = departmentIds.get(parent)
    if (parentId !== undefined) await updateDepartment(key, { parent: parentId })
  }
  return outcome
}
