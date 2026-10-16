import type { Class, Doc, Ref } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import { HEAD_DEPARTMENT, TEAM_MENTION_ATTR, teamHandle } from '@servone/notify-rules'

export { resolveTeamMembers, teamHandle, teamHandles, type TeamMemberFilter } from '@servone/notify-rules'

export const departmentClass = 'hr:class:Department' as Ref<Class<TeamDepartment>>
export const headDepartment = HEAD_DEPARTMENT as Ref<TeamDepartment>
const personClass = 'contact:class:Person'

export const teamAttr = TEAM_MENTION_ATTR

export const teamTargetContext = 'servone:team-mention-target'
export type TeamTarget = () => Doc | undefined

export type TeamChoice = 'add' | 'without'

export const teamStrings = {
  MentionDescription: 'chunter:string:ServoneTeamMentionDescription' as IntlString,
  NotifySection: 'chunter:string:ServoneNotifySection' as IntlString,
  MembersTooltip: 'chunter:string:ServoneTeamMembersTooltip' as IntlString,
  NotInChannel: 'chunter:string:ServoneTeamNotInChannel' as IntlString,
  AddAndSend: 'chunter:string:ServoneAddAndSend' as IntlString,
  SendWithoutThem: 'chunter:string:ServoneSendWithoutThem' as IntlString
}

export interface TeamDepartment extends Doc {
  name: string
  parent?: Ref<TeamDepartment>
  teamLead: Ref<Doc> | null
  managers: Array<Ref<Doc>>
  members: Array<Ref<Doc>>
}

export type TeamSource = Pick<
  TeamDepartment,
  '_id' | 'name' | 'parent' | 'teamLead' | 'managers' | 'members' | 'createdOn'
>

export function matchesTeam (query: string, name: string, handle: string): boolean {
  const needle = query.trim().toLowerCase()
  return handle.includes(teamHandle(needle)) || name.toLowerCase().includes(needle)
}

type AttrValue = string | number | boolean | null
interface MarkupNode {
  type: string
  attrs?: Record<string, AttrValue>
  content?: MarkupNode[]
}

function parseMarkup (markup: string): MarkupNode | undefined {
  if (!markup.startsWith('{')) return undefined
  return JSON.parse(markup)
}

function teamOf (node: MarkupNode): Ref<TeamDepartment> | undefined {
  if (node.type !== 'reference' || node.attrs?.objectclass !== departmentClass || node.attrs?.[teamAttr] != null) return
  const id = node.attrs?.id
  return typeof id === 'string' ? (id as Ref<TeamDepartment>) : undefined
}

function isTeamMember (node: MarkupNode): boolean {
  return node.type === 'reference' && node.attrs?.[teamAttr] != null
}

function mapContent (node: MarkupNode, map: (children: MarkupNode[]) => MarkupNode[]): MarkupNode {
  if (node.content === undefined) return node
  return { ...node, content: map(node.content.map((child) => mapContent(child, map))) }
}

function collectTeams (node: MarkupNode, found: Set<Ref<TeamDepartment>>): void {
  const team = teamOf(node)
  if (team !== undefined) found.add(team)
  for (const child of node.content ?? []) collectTeams(child, found)
}

export function mentionedTeams (markup: string): Array<Ref<TeamDepartment>> {
  const doc = parseMarkup(markup)
  const found = new Set<Ref<TeamDepartment>>()
  if (doc !== undefined) collectTeams(doc, found)
  return [...found]
}

export function collapseTeamMentions (markup: string): string {
  if (!markup.includes(`"${teamAttr}"`)) return markup
  const doc = parseMarkup(markup)
  if (doc === undefined) return markup
  return JSON.stringify(mapContent(doc, (children) => children.filter((child) => !isTeamMember(child))))
}

export function expandTeamMentions (markup: string, membersOf: (team: Ref<TeamDepartment>) => Array<Ref<Doc>>): string {
  const collapsed = collapseTeamMentions(markup)
  if (mentionedTeams(collapsed).length === 0) return collapsed
  const doc = parseMarkup(collapsed)
  if (doc === undefined) return collapsed
  const expanded = mapContent(doc, (children) =>
    children.flatMap((child) => {
      const team = teamOf(child)
      if (team === undefined) return [child]
      const hidden = membersOf(team).map((person) => ({
        type: 'reference',
        attrs: { id: person, objectclass: personClass, label: '', [teamAttr]: team }
      }))
      return [child, ...hidden]
    })
  )
  return JSON.stringify(expanded)
}
