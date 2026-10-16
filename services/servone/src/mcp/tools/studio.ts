import contact, { formatName } from '@hcengineering/contact'
import type { AccountUuid, PersonId } from '@hcengineering/core'
import {
  allActions,
  applyChange,
  type ApplyOutcome,
  type AutomationSpec,
  type ChangeRecord,
  type ChangeStatus,
  ConfigError,
  type ConfigErrorCode,
  type ConfigSession,
  type ConfigSnapshot,
  describe as describeConfig,
  type DiffLine,
  type FieldInfo,
  type FieldKindInfo,
  type GroupInfo,
  type LinkInfo,
  listChanges,
  parseChangeId,
  parseOperations,
  plan,
  type RecordTypeInfo,
  type RiskLevel,
  saveDraft,
  type SpaceInfo,
  targetOf,
  undoChange,
  type ValidationIssue
} from '@servone/config'
import { z } from 'zod'

import { type AnyTool, capText, defineTool, ToolInputError } from '../tool'
import type { WorkspaceSession } from '../types'
import { namesBySocialId } from './people'

// session.client maps rows through the model cached at session open, which lacks record types created since then.
export function configSession (session: WorkspaceSession): ConfigSession {
  return {
    client: {
      findAll: async (_class, query, options) => await session.rest.findAll(_class, query, options),
      tx: async (tx) => await session.client.tx(tx)
    },
    account: session.account
  }
}

function kindLabel (kind: FieldKindInfo): string {
  switch (kind.kind) {
    case 'text':
      return 'text'
    case 'longText':
      return 'long text'
    case 'number': {
      const limits: string[] = []
      if (kind.isInteger === true) limits.push('whole')
      if (kind.min !== undefined) limits.push(`min ${kind.min}`)
      if (kind.max !== undefined) limits.push(`max ${kind.max}`)
      return limits.length === 0 ? 'number' : `number (${limits.join(', ')})`
    }
    case 'money':
      return `money ${kind.currency}`
    case 'date':
      return kind.hasTime === true ? 'date and time' : 'date'
    case 'boolean':
      return 'yes/no'
    case 'select':
      return `dropdown [${kind.options.join(', ')}]`
    case 'multiSelect':
      return `multi-choice dropdown [${kind.options.join(', ')}]`
    case 'person':
      return 'person'
    case 'autoNumber':
      return `auto-number ${kind.prefix}`
    case 'reference':
      return `read-only link to ${kind.to}`
    case 'other':
      return 'other (not editable here)'
  }
}

function fieldLine (field: FieldInfo): string {
  const marks = [kindLabel(field.kind)]
  if (field.isRequired) marks.push('required')
  if (field.isBuiltIn) marks.push('built-in')
  return `    - ${field.key} "${field.name}": ${marks.join(', ')}`
}

async function namesByAccount (session: WorkspaceSession, accounts: AccountUuid[]): Promise<Map<AccountUuid, string>> {
  if (accounts.length === 0) return new Map()
  const persons = await session.client.findAll(contact.mixin.Employee, { personUuid: { $in: [...new Set(accounts)] } })
  const names = new Map<AccountUuid, string>()
  for (const person of persons) {
    if (person.personUuid !== undefined) names.set(person.personUuid, formatName(person.name))
  }
  return names
}

// Account ids stay in the text: setAccess takes them and no other tool prints them.
function peopleText (names: Map<AccountUuid, string>, accounts: AccountUuid[]): string {
  if (accounts.length === 0) return 'none'
  return accounts
    .map((account) => {
      const name = names.get(account)
      return name === undefined ? account : `${name} <${account}>`
    })
    .join(', ')
}

function spaceName (spaces: SpaceInfo[], id: string): string {
  const space = spaces.find((it) => it.id === id)
  return space === undefined ? id : `"${space.name}"`
}

// A field-based approver reads the record itself and a preset has no fixed accounts, so only {kind: "people"} names anyone here.
function targetAccountsOf (spec: AutomationSpec): AccountUuid[] {
  return allActions(spec).flatMap((action) => {
    const target = targetOf(action)
    return target?.kind === 'people' ? target.people : []
  })
}

function automationLines (type: RecordTypeInfo, names: Map<AccountUuid, string>): string[] {
  if (type.automations.length === 0) return []
  const lines = ['  automations:']
  for (const rule of type.automations) {
    if (rule.automation === null) {
      lines.push(`    - ${rule.key} "${rule.name}" (made outside Studio, read-only)`, ...rule.sentences.map((it) => `      ${it}`))
      continue
    }
    const [first, ...rest] = rule.sentences
    lines.push(`    - ${rule.key} "${rule.name}": ${first ?? ''}`, ...rest.map((it) => `      ${it}`))
    const accounts = targetAccountsOf(rule.automation)
    if (accounts.length > 0) lines.push(`      people: ${peopleText(names, accounts)}`)
    // setAutomation replaces the whole rule, so the model must resend every part it keeps.
    lines.push(`      rule: ${JSON.stringify(rule.automation)}`)
  }
  return lines
}

// A child type also runs its parents' rules, but they are edited on the parent.
function inheritedLines (all: ConfigSnapshot, type: RecordTypeInfo): string[] {
  const lines: string[] = []
  const seen = new Set([type.key])
  for (let parent = all.types.find((it) => it.key === type.basedOn); parent !== undefined && !seen.has(parent.key); parent = all.types.find((it) => it.key === parent?.basedOn)) {
    seen.add(parent.key)
    for (const rule of parent.automations) {
      lines.push(`    - ${rule.key} "${rule.name}" (inherited from ${parent.key}, edit it there): ${rule.sentences.join(' ')}`)
    }
  }
  return lines.length === 0 ? [] : ['  inherited automations (also run on this type):', ...lines]
}

function typeLines (all: ConfigSnapshot, snapshot: ConfigSnapshot, type: RecordTypeInfo, names: Map<AccountUuid, string>): string[] {
  const marks: string[] = []
  if (type.isSystem) marks.push('system type: fields can be added and renamed, the type cannot be archived')
  if (type.isArchived) marks.push('archived')
  const shownIn = type.spaces.length === 0 ? 'no space' : type.spaces.map((id) => spaceName(snapshot.spaces, id)).join(', ')
  const lines = [
    marks.length === 0 ? `${type.key} "${type.name}"` : `${type.key} "${type.name}" (${marks.join('; ')})`,
    `  based on: ${type.basedOn ?? 'nothing'} | shown in: ${shownIn}`,
    type.fields.length === 0 ? '  fields: none' : '  fields:',
    ...type.fields.map(fieldLine)
  ]
  for (const access of type.access) {
    lines.push(
      `  access in ${spaceName(snapshot.spaces, access.space)}: viewers ${peopleText(names, access.viewer)}; ` +
        `editors ${peopleText(names, access.editor)}; managers ${peopleText(names, access.manager)}`
    )
  }
  return [...lines, ...automationLines(type, names), ...inheritedLines(all, type)]
}

function manyText (isMany: boolean): string {
  return isMany ? 'many' : 'one'
}

function linkLine (link: LinkInfo): string {
  return (
    `- ${link.key}: each ${link.from} has ${manyText(link.fromMany)} ${link.to} (field "${link.fromName}"); ` +
    `each ${link.to} has ${manyText(link.toMany)} ${link.from} (field "${link.toName}")`
  )
}

function groupLines (group: GroupInfo): string[] {
  return [`- ${group.key} "${group.name}" on ${group.type}:`, ...group.fields.map(fieldLine)]
}

function spaceEntry (space: SpaceInfo): string {
  const marks = [space.id]
  if (space.isRestricted) marks.push('restricted')
  if (space.isArchived) marks.push('archived')
  return `"${space.name}" (${marks.join(', ')})`
}

async function snapshotText (session: WorkspaceSession, snapshot: ConfigSnapshot, all: ConfigSnapshot): Promise<string> {
  const accounts = snapshot.types.flatMap((type) => [
    ...type.access.flatMap((it) => [...it.viewer, ...it.editor, ...it.manager]),
    ...type.automations.flatMap((rule) => (rule.automation === null ? [] : targetAccountsOf(rule.automation)))
  ])
  const names = await namesByAccount(session, accounts)
  const lines = [`Record types (${snapshot.types.length}); operations in plan_config_change refer to them by key:`]
  for (const type of snapshot.types) lines.push('', ...typeLines(all, snapshot, type, names))
  lines.push('', `Links (${snapshot.links.length}):`, ...snapshot.links.map(linkLine))
  lines.push('', `Field groups (${snapshot.groups.length}):`, ...snapshot.groups.flatMap(groupLines))
  lines.push('', `Spaces: ${snapshot.spaces.length === 0 ? 'none' : snapshot.spaces.map(spaceEntry).join(', ')}`)
  return lines.join('\n')
}

const describeRecordTypes = defineTool({
  name: 'describe_record_types',
  title: 'Describe record types',
  description:
    'Shows how records are set up in this workspace. A record type is a kind of record such as a leave request or a customer; ' +
    'its fields hold the values (text, number, money, date, yes/no, dropdown, person, auto-number); a link connects two record types ' +
    'and shows as a field on both; a field group is a named set of extra fields for one type; access says who can view, enter or ' +
    'manage records of a type in each space; an automation is a rule "when <trigger> then <actions>", such as sending every new ' +
    'leave request for approval. Prints every type with its key, fields, spaces, access and automations (each with its full rule), ' +
    'then links, field groups and spaces. Operations in plan_config_change use these keys.',
  input: z.object({
    type: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Record type key such as "nghi-phep", to show only that type with its links and field groups')
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (session, args) => {
    const config = configSession(session)
    const snapshot = await describeConfig(config, { type: args.type })
    const all = args.type === undefined ? snapshot : await describeConfig(config)
    if (args.type !== undefined && snapshot.types.length === 0) {
      const known = all.types.map((it) => it.key)
      throw new ToolInputError(`Record type "${args.type}" not found. Known: ${known.length === 0 ? 'none' : known.join(', ')}`)
    }
    return capText(await snapshotText(session, snapshot, all))
  }
})

const OPERATIONS_HELP = [
  'Operations run in order, so later ones can use keys created by earlier ones. New keys are lowercase slugs like "cong-tac"; ' +
    'existing types, fields, links and groups are referred to by the keys describe_record_types prints.',
  'createType {key, name, basedOn?, spaces?} | copyType {from, key, name} | updateType {type, name?, icon?, color?, spaces?} | ' +
    'archiveType {type} | unarchiveType {type}. spaces are space names or ids.',
  'addField {type, key, name, kind, required?} | updateField {type, field, name?, required?} | removeField {type, field}.',
  'kind is {kind: "text" | "longText" | "boolean" | "person"} | {kind: "number", min?, max?, isInteger?} | {kind: "money", currency} | ' +
    '{kind: "date", hasTime?} | {kind: "select" | "multiSelect", options: [names]} | {kind: "autoNumber", prefix}.',
  'setOptions {type, field, options: [{add, at?} | {rename, to} | {reorder: [names]} | {remove, mapTo?}]}; ' +
    'mapTo moves records holding the removed option to another option.',
  'addLink {from, to, fromName, toName, fromMany, toMany}: fromName is the field shown on "from" records, ' +
    'fromMany means one "from" record can link to many "to" records | removeLink {link}.',
  'createGroup {key, name, types: [type keys]} | removeGroup {group} | setView {type, view: {columns?, groupBy?}}.',
  'setAccess {type, access: {spaces: [{space, isRestricted?, viewer?, editor?, manager?}]}}: people are account ids from ' +
    'describe_record_types; viewer reads, editor also creates and edits, manager also deletes.',
  'setAutomation {type, key, automation: {name, trigger, actions, onApproved?, onRejected?} | null}: one rule ' +
    '"when <trigger> then <actions>"; null removes it; editing resends the whole rule printed by describe_record_types. ' +
    'Only applies to records created after the rule is saved.',
  'trigger {kind: "created"} | {kind: "fieldChanged", field, to} (dropdown or yes/no field) | {kind: "date", field, offsetDays} ' +
    '(negative = before). actions: {kind: "requestApproval", from} (everyone asked must approve) | {kind: "setField", field, value} | ' +
    '{kind: "createLinked", type, link, title, values: [{field, value}]} | {kind: "createTodo", title, assignee} | ' +
    '{kind: "lockField", fields} | {kind: "lockRecord"}. A date trigger field or a from/assignee person field may be empty when the record is created: ' +
    'the rule waits until it is filled. A linked target needs the linked record chosen before the rule runs.',
  'value/to (in setField, createLinked values and the fieldChanged trigger) is written as: a string of text for a text field, ' +
    'a plain number for a money or number field, true or false for a yes/no field, an account id (string) for a person field, or an ' +
    'existing option name of that dropdown; a date field cannot be set this way, only read by a date trigger.',
  'from/assignee: {kind: "field", field} (a person field) | {kind: "people", people: [account ids]} | ' +
    '{kind: "preset", preset: "viewer" | "editor" | "manager"} (approval only) | {kind: "linked", link, field} (a person field on the ' +
    'record joined by that link key; a todo takes the first joined record) | {kind: "initiator"} (whoever created the record). ' +
    'requestApproval or createTodo must be the last action; ' +
    'onApproved/onRejected run after the approval. Person field values are account ids; account ids for {kind: "people"} must already ' +
    'belong to someone shown in describe_record_types (access or another rule) — this tool cannot look up a person not yet listed there.'
].join('\n')

// Operation shapes belong to parseOperations in @servone/config; the schema only guarantees JSON with an op name.
const operationInput = z.object({ op: z.string().describe('Operation name, e.g. "addField"') }).catchall(z.json())

// 'failed' is a rejected server write or a corrupt change record: mcp.ts reports it without internals.
export type NextSteps = Record<Exclude<ConfigErrorCode, 'failed'>, string>

export const NEXT_STEP: NextSteps = {
  invalid: 'Fix the operations and call plan_config_change again.',
  stale:
    'The configuration changed after this draft was made. Call plan_config_change again with the same operations to get a fresh change id.',
  'not-found': 'Check the change id with list_config_changes.',
  'wrong-status': 'Check its status with list_config_changes.',
  forbidden: 'Only workspace maintainers can change record types.',
  'self-approval': 'Another workspace maintainer has to approve it.'
}

export async function withConfigErrors<T> (call: () => Promise<T>, nextSteps: NextSteps = NEXT_STEP): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    const code = error.code
    if (code === 'failed') throw error
    throw new ToolInputError(`${error.message}. ${nextSteps[code]}`)
  }
}

export function issueText (heading: string, issues: ValidationIssue[]): string {
  const lines = issues.map((issue) => {
    const where = issue.opIndex < 0 ? 'whole change' : `operation ${issue.opIndex + 1}`
    return `- ${where}: ${issue.message}`
  })
  if (issues.some((issue) => issue.code === 'forbidden')) lines.push(NEXT_STEP.forbidden)
  return [`${heading}; nothing was saved.`, ...lines].join('\n')
}

const RISK_TEXT: Record<RiskLevel, string> = {
  safe: 'safe (no data is lost)',
  destructive: 'destructive (hides or removes data that records hold; needs confirm: true)',
  sensitive:
    'sensitive (changes who can see or edit records, or adds, changes or removes an automation that asks for approval or changes money; ' +
    'another workspace maintainer must approve)'
}

function diffLine (line: DiffLine): string {
  const count = line.affected === undefined || line.affected === 0 ? '' : ` [${line.affected} records]`
  return `- [${line.risk}] ${line.text}${count}`
}

export function changeLines (change: ChangeRecord): string[] {
  return [`Risk: ${RISK_TEXT[change.risk]}`, 'Changes:', ...change.diff.map(diffLine)]
}

export function draftNextStep (change: ChangeRecord): string {
  const call = `apply_config_change with changeId "${change.id}"`
  // A sensitive change can also remove data; apply refuses it without confirm either way.
  const applyStep = change.diff.some((line) => line.risk === 'destructive')
    ? `Next: show the lines above to the user; if they agree, call ${call} and confirm: true.`
    : `Next: call ${call}.`
  if (change.risk !== 'sensitive') return applyStep
  return `${applyStep} It then waits as pending until another workspace maintainer approves it; the author cannot approve it.`
}

const planConfigChange = defineTool({
  name: 'plan_config_change',
  title: 'Plan config change',
  description:
    'Drafts a change to record types, fields, links, field groups, views, access or automations without applying it. ' +
    'Returns the change id, one line per effect with how many records it touches, the risk (safe, destructive or sensitive) ' +
    'and the next call to make. Nothing changes in the workspace until apply_config_change. Workspace maintainers only.',
  input: z.object({ operations: z.array(operationInput).min(1).describe(OPERATIONS_HELP) }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (session, args) => {
    const parsed = parseOperations(args.operations)
    if (parsed.issues.length > 0) throw new ToolInputError(issueText('The operations could not be read', parsed.issues))
    const config = configSession(session)
    const change = await withConfigErrors(async () => {
      const draft = await plan(config, parsed.ops)
      if (draft.issues.length > 0) throw new ToolInputError(issueText('The change cannot be made', draft.issues))
      return await saveDraft(config, draft)
    })
    return capText([`Drafted change ${change.id} (not applied yet).`, ...changeLines(change), draftNextStep(change)].join('\n'))
  }
})

const changeIdInput = z.string().trim().min(1).describe('Change id printed by plan_config_change or list_config_changes')
const confirmInput = z
  .boolean()
  .default(false)
  .describe('Set true only after the user has seen what a destructive change hides or removes')

// Approval stays in Studio: the spec gives MCP no approve tool, and the author may not approve their own change.
const PENDING_TEXT =
  'Another workspace maintainer, not the author, must approve it in the change history ' +
  '(Settings > Loại hồ sơ > Lịch sử thay đổi); until then nothing changes. ' +
  'To see whether it was approved, check with list_config_changes status pending.'

function subjectOf (change: ChangeRecord): string {
  return change.undoOf === undefined ? `change ${change.id}` : `the undo of change ${change.undoOf} (recorded as change ${change.id})`
}

function outcomeHeadline (outcome: ApplyOutcome): string {
  const subject = subjectOf(outcome.change)
  switch (outcome.kind) {
    case 'applied':
      return `Applied ${subject}.`
    case 'needsConfirm':
      return `Not applied yet: ${subject} hides or removes data.`
    case 'pendingApproval':
      return `Not applied yet: ${subject} is waiting for approval.`
  }
}

function outcomeNextStep (outcome: ApplyOutcome): string {
  const { change } = outcome
  switch (outcome.kind) {
    case 'applied':
      return change.undoOf === undefined
        ? `To revert it, call undo_config_change with changeId "${change.id}".`
        : `Change ${change.undoOf} is now marked undone.`
    case 'needsConfirm':
      // The undo draft already exists; undoing again would stack a second draft.
      return `Show the lines above to the user. If they agree, call apply_config_change with changeId "${change.id}" and confirm: true.`
    case 'pendingApproval':
      return PENDING_TEXT
  }
}

function outcomeText (outcome: ApplyOutcome): string {
  return [outcomeHeadline(outcome), ...changeLines(outcome.change), outcomeNextStep(outcome)].join('\n')
}

const applyConfigChange = defineTool({
  name: 'apply_config_change',
  title: 'Apply config change',
  description:
    'Applies a change drafted by plan_config_change, by its change id. Safe changes apply at once. ' +
    'Destructive changes (archiving a type, removing a field, link or dropdown option that records use) need confirm: true ' +
    'after the user has seen the preview; without it nothing is written and the preview with record counts comes back. ' +
    'Sensitive changes (access, and automations that ask for approval or change a money field) are saved as pending until ' +
    'another workspace maintainer approves them. Workspace maintainers only.',
  input: z.object({ changeId: changeIdInput, confirm: confirmInput }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  run: async (session, args) => {
    const config = configSession(session)
    const outcome = await withConfigErrors(
      async () => await applyChange(config, parseChangeId(args.changeId), { isConfirmed: args.confirm })
    )
    return capText(outcomeText(outcome))
  }
})

const undoConfigChange = defineTool({
  name: 'undo_config_change',
  title: 'Undo config change',
  description:
    'Reverts an applied change by its change id: drafts the opposite operations and applies them as a new change, ' +
    'with the same rules as apply_config_change (destructive needs confirm: true, sensitive waits for another maintainer). ' +
    'Find change ids with list_config_changes. Workspace maintainers only.',
  input: z.object({
    changeId: changeIdInput.describe('Id of an applied change (see list_config_changes)'),
    confirm: confirmInput
  }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  run: async (session, args) => {
    const config = configSession(session)
    const changeId = parseChangeId(args.changeId)
    // undoChange refreshes its own draft, so a stale undo is retried by undoing again, not by re-planning.
    const nextSteps: NextSteps = {
      ...NEXT_STEP,
      stale: `The configuration changed while undoing. Call undo_config_change again with changeId "${changeId}".`
    }
    const outcome = await withConfigErrors(
      async () => await undoChange(config, changeId, { isConfirmed: args.confirm }),
      nextSteps
    )
    return capText(outcomeText(outcome))
  }
})

const CHANGE_STATUSES = ['draft', 'pending', 'applied', 'undone', 'rejected'] as const satisfies readonly ChangeStatus[]
const DEFAULT_CHANGES = 20
const MAX_CHANGES = 100 // one line per change keeps a full page far below MAX_TOOL_TEXT

function formatTime (ts: number): string {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ')
}

function changeRow (change: ChangeRecord, names: Map<PersonId, string>): string {
  const parts = [
    `${change.id}  ${formatTime(change.createdOn)} UTC  [${change.status}] [${change.risk}]  ${change.summary}`,
    `by ${names.get(change.author) ?? 'unknown'}`
  ]
  if (change.approver !== undefined) parts.push(`approved by ${names.get(change.approver) ?? 'unknown'}`)
  if (change.undoOf !== undefined) parts.push(`undoes ${change.undoOf}`)
  return parts.join('  ')
}

const listConfigChanges = defineTool({
  name: 'list_config_changes',
  title: 'List config changes',
  description:
    'Lists record-type changes newest first, one per line: change id, time (UTC), status (draft, pending, applied, undone, ' +
    'rejected), risk, summary, author, approver, and which change it undoes. Filter by status or record type key. ' +
    'Use it to find a change id to apply, check or undo.',
  input: z.object({
    status: z.enum(CHANGE_STATUSES).optional(),
    type: z.string().trim().min(1).optional().describe('Record type key such as "nghi-phep"'),
    limit: z.number().int().min(1).max(MAX_CHANGES).default(DEFAULT_CHANGES).describe('Max changes to return')
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (session, args) => {
    const changes = await listChanges(configSession(session), { status: args.status, type: args.type, limit: args.limit })
    if (changes.length === 0) return 'No config changes match'
    const people = changes.flatMap((it) => (it.approver === undefined ? [it.author] : [it.author, it.approver]))
    const names = await namesBySocialId(session, people)
    return capText(['Newest first:', ...changes.map((it) => changeRow(it, names))].join('\n'))
  }
})

export const studioTools: AnyTool[] = [describeRecordTypes, planConfigChange, applyConfigChange, undoConfigChange, listConfigChanges]
