import { buildSocialIdString, SocialIdType, type AccountUuid, type Class, type Doc, type Ref } from '@hcengineering/core'
import { createQuery } from '@hcengineering/presentation'
import { derived, writable, type Readable } from 'svelte/store'
import { departmentClass, teamHandles, type TeamDepartment } from './team-mentions'

export interface TeamEmployee extends Doc {
  active: boolean
  personUuid?: AccountUuid
}
export const employeeMixin = 'contact:mixin:Employee' as Ref<Class<TeamEmployee>>

interface BotIdentity extends Doc {
  key: string
  attachedTo: Ref<Doc>
}
const socialIdentityClass = 'contact:class:SocialIdentity' as Ref<Class<BotIdentity>>

export const BOT_EMAILS = ['webhooks@servone.vn', 'forms@servone.vn']

export interface TeamDirectory {
  departments: TeamDepartment[]
  handles: Map<Ref<TeamDepartment>, string>
  active: Set<Ref<Doc>>
  bots: Set<Ref<Doc>>
}

export function withoutBots<T extends { _id: Ref<Doc> }> (people: T[], bots: Set<Ref<Doc>>): T[] {
  return people.filter((person) => !bots.has(person._id))
}

let directory: Readable<TeamDirectory> | undefined

export function teamDirectory (): Readable<TeamDirectory> {
  if (directory !== undefined) return directory
  const departments = writable<TeamDepartment[]>([])
  const employees = writable<TeamEmployee[]>([])
  const bots = writable(new Set<Ref<Doc>>())
  createQuery(true).query(departmentClass, {}, (found) => {
    departments.set(found)
  })
  createQuery(true).query(employeeMixin, { active: true }, (found) => {
    employees.set(found)
  })
  const botKeys = BOT_EMAILS.map((email) => buildSocialIdString({ type: SocialIdType.EMAIL, value: email }))
  createQuery(true).query(socialIdentityClass, { key: { $in: botKeys } }, (found) => {
    bots.set(new Set(found.map((identity) => identity.attachedTo)))
  })
  directory = derived([departments, employees, bots], ([$departments, $employees, $bots]) => ({
    departments: $departments,
    handles: teamHandles($departments),
    active: new Set(withoutBots($employees, $bots).map((employee) => employee._id)),
    bots: $bots
  }))
  return directory
}
