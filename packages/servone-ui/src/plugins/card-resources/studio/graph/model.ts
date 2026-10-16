import {
  allActions,
  type AutomationAction,
  type AutomationInfo,
  type AutomationSpec,
  type ConfigSnapshot,
  type PersonTarget,
  type RecordTypeInfo
} from '@servone/config'
import { accessRows } from '../access'
import { fieldRows, fieldsWithInherited, parentChain } from '../fields'
import { groupsOf } from '../groups'
import { linkRows } from '../links'
import { text, type StringKey } from '../strings'
import { activeSpaces, customerTypes, findType } from '../type-list'
import { actionPhrase, approverPhrase, landingState, questionKindLabel, triggerPhrase, waitingState } from './phrases'

export type Branch = 'questions' | 'process' | 'links' | 'access'

export type NodeKind =
  | 'type'
  | 'addType'
  | 'form'
  | 'branch'
  | 'question'
  | 'inherited'
  | 'group'
  | 'trigger'
  | 'approval'
  | 'step'
  | 'hulyRule'
  | 'link'
  | 'access'
  | 'add'

export type NodeTarget =
  | { kind: 'none' }
  | { kind: 'openForm', typeKey: string }
  | { kind: 'createType' }
  | { kind: 'question', owner: string, fieldKey: string | undefined }
  | { kind: 'rule', ruleKey: string | undefined }
  | { kind: 'hulyProcess', processId: string }
  | { kind: 'link', linkKey: string | undefined }
  | { kind: 'access' }

export type ChipKind = 'person' | 'space'

export interface NodeChip {
  kind: ChipKind
  label: string
}

export interface GraphNode {
  id: string
  kind: NodeKind
  label: string
  detail: string
  lines: string[]
  chips: NodeChip[]
  state: string | undefined
  branch: Branch | undefined
  isPending: boolean
  target: NodeTarget
}

export type EdgeStyle = 'tree' | 'link' | 'rule'

export type Outcome = 'approved' | 'rejected'

export interface GraphEdge {
  id: string
  source: string
  target: string
  label: string
  style: EdgeStyle
  branch: Branch | undefined
  outcome: Outcome | undefined
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const ADD_TYPE_ID = 'add:type'

const MAX_CHIPS = 4

export function typeNodeId (key: string): string {
  return `type:${key}`
}

function firstApprover (type: RecordTypeInfo): PersonTarget | undefined {
  for (const rule of type.automations) {
    const last = rule.automation?.actions.at(-1)
    if (last?.kind === 'requestApproval') return last.from
  }
  return undefined
}

function isCreatedByRule (snapshot: ConfigSnapshot, type: RecordTypeInfo): boolean {
  return snapshot.types.some((other) =>
    other.automations.some((rule) => {
      const spec = rule.automation
      return spec !== null && allActions(spec).some((action) => action.kind === 'createLinked' && action.type === type.key)
    })
  )
}

function processSummary (snapshot: ConfigSnapshot, type: RecordTypeInfo): string {
  const approver = firstApprover(type)
  if (approver !== undefined) return text('GraphApprovedBy', { who: approverPhrase(snapshot, type, approver) })
  if (type.automations.some((it) => it.automation === null)) return text('GraphHulyProcess')
  if (isCreatedByRule(snapshot, type)) return text('GraphAutoCreated')
  return text(type.automations.length > 0 ? 'GraphHasProcess' : 'GraphNoProcess')
}

function typeBadge (snapshot: ConfigSnapshot, type: RecordTypeInfo): string {
  const count = fieldsWithInherited(snapshot, type).filter((it) => !it.isBuiltIn).length
  return `${text('GraphQuestionCount', { count })} · ${processSummary(snapshot, type)}`
}

function chipsOf (snapshot: ConfigSnapshot, type: RecordTypeInfo): NodeChip[] {
  const people = fieldsWithInherited(snapshot, type)
    .filter((it) => it.kind.kind === 'person' && !it.isBuiltIn)
    .map((it): NodeChip => ({ kind: 'person', label: it.name }))
  const spaces = activeSpaces(snapshot)
    .filter((it) => type.spaces.includes(it.id))
    .map((it): NodeChip => ({ kind: 'space', label: it.name }))
  return [...people, ...spaces].slice(0, MAX_CHIPS)
}

function ruleEdges (type: RecordTypeInfo, shown: ReadonlySet<string>): GraphEdge[] {
  return type.automations.flatMap((rule) => {
    const spec = rule.automation
    if (spec === null) return []
    const phases: Array<[AutomationAction[], StringKey]> = [
      [spec.actions, 'GraphCreatesOnRun'],
      [spec.onApproved ?? [], 'GraphCreatesOnApproved'],
      [spec.onRejected ?? [], 'GraphCreatesOnRejected']
    ]
    return phases.flatMap(([actions, label]) =>
      actions.flatMap((action): GraphEdge[] => {
        if (action.kind !== 'createLinked' || !shown.has(action.type)) return []
        return [
          {
            id: `rule:${type.key}:${rule.key}:${label}:${action.type}`,
            source: typeNodeId(type.key),
            target: typeNodeId(action.type),
            label: text(label),
            style: 'rule',
            branch: undefined,
            outcome: undefined
          }
        ]
      })
    )
  })
}

export function uniqueEdges (edges: GraphEdge[]): GraphEdge[] {
  return [...new Map(edges.map((edge) => [edge.id, edge])).values()]
}

export function companyGraph (snapshot: ConfigSnapshot, pendingTypeKeys: ReadonlySet<string>): Graph {
  const types = customerTypes(snapshot)
  const shown = new Set(types.map((it) => it.key))
  const nodes: GraphNode[] = types.map((type) => ({
    id: typeNodeId(type.key),
    kind: 'type',
    label: type.name,
    detail: typeBadge(snapshot, type),
    lines: [],
    chips: chipsOf(snapshot, type),
    state: undefined,
    branch: undefined,
    isPending: pendingTypeKeys.has(type.key),
    target: { kind: 'openForm', typeKey: type.key }
  }))
  nodes.push({
    id: ADD_TYPE_ID,
    kind: 'addType',
    label: text(nodes.length === 0 ? 'GraphStart' : 'GraphAddType'),
    detail: text('GraphAddTypeHelp'),
    lines: [],
    chips: [],
    state: undefined,
    branch: undefined,
    isPending: false,
    target: { kind: 'createType' }
  })
  const links = snapshot.links
    .filter((it) => shown.has(it.from) && shown.has(it.to))
    .map((it): GraphEdge => ({
      id: `link:${it.key}`,
      source: typeNodeId(it.from),
      target: typeNodeId(it.to),
      label: it.fromName,
      style: 'link',
      branch: undefined,
      outcome: undefined
    }))
  return { nodes, edges: uniqueEdges([...links, ...types.flatMap((type) => ruleEdges(type, shown))]) }
}

export const BRANCHES: Branch[] = ['questions', 'process', 'links', 'access']

const BRANCH_LABEL: Record<Branch, StringKey> = {
  questions: 'GraphQuestions',
  process: 'GraphProcess',
  links: 'GraphLinks',
  access: 'GraphAccess'
}

export function formNodeId (key: string): string {
  return `form:${key}`
}

export function branchNodeId (branch: Branch): string {
  return `branch:${branch}`
}

interface Subtree {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function node (id: string, kind: NodeKind, label: string, branch: Branch, target: NodeTarget, detail = ''): GraphNode {
  return { id, kind, label, detail, lines: [], chips: [], state: undefined, branch, isPending: false, target }
}

function edge (source: string, target: string, branch: Branch): GraphEdge {
  return { id: `${source}->${target}`, source, target, label: '', style: 'tree', branch, outcome: undefined }
}

function under (parentId: string, branch: Branch, nodes: GraphNode[]): Subtree {
  return { nodes, edges: nodes.map((it) => edge(parentId, it.id, branch)) }
}

function questionsOf (snapshot: ConfigSnapshot, type: RecordTypeInfo): Subtree {
  const branch: Branch = 'questions'
  const parentId = branchNodeId(branch)
  const own = fieldRows(snapshot, type)
    .filter((row) => row.kind !== 'link' && !row.isBuiltIn)
    .map((row) =>
      node(
        `q:${row.key}`,
        'question',
        row.name,
        branch,
        row.isEditable ? { kind: 'question', owner: type.key, fieldKey: row.key } : { kind: 'none' },
        questionKindLabel(row.kind)
      )
    )
  const seen = new Set(type.fields.map((it) => it.key))
  const inherited = parentChain(snapshot, type).flatMap((parent) =>
    parent.fields
      .filter((it) => !it.isBuiltIn && !seen.has(it.key))
      .map((it) => {
        seen.add(it.key)
        return node(`iq:${it.key}`, 'inherited', it.name, branch, { kind: 'openForm', typeKey: parent.key }, text('GraphInheritedFrom', { name: parent.name }))
      })
  )
  const groups = groupsOf(snapshot, type.key)
  const groupNodes = groups.map((it) => node(`g:${it.key}`, 'group', it.name, branch, { kind: 'none' }, text('GraphGroup')))
  const add = node(`add:${branch}`, 'add', text('GraphAddQuestion'), branch, { kind: 'question', owner: type.key, fieldKey: undefined })
  const top = under(parentId, branch, [...own, ...inherited, ...groupNodes, add])
  const inGroups = groups.map((it) =>
    under(
      `g:${it.key}`,
      branch,
      it.fields.map((groupField) =>
        node(
          `gq:${it.key}:${groupField.key}`,
          'question',
          groupField.name,
          branch,
          { kind: 'question', owner: it.key, fieldKey: groupField.key },
          questionKindLabel(groupField.kind.kind)
        )
      )
    )
  )
  return { nodes: [...top.nodes, ...inGroups.flatMap((it) => it.nodes)], edges: [...top.edges, ...inGroups.flatMap((it) => it.edges)] }
}

function stepLines (snapshot: ConfigSnapshot, type: RecordTypeInfo, actions: AutomationAction[]): string[] {
  if (actions.length === 0) return [text('GraphNothingMore')]
  return actions.map((action) => actionPhrase(snapshot, type, action))
}

function ruleChain (snapshot: ConfigSnapshot, type: RecordTypeInfo, rule: AutomationInfo, spec: AutomationSpec): Subtree {
  const branch: Branch = 'process'
  const target: NodeTarget = { kind: 'rule', ruleKey: rule.key }
  const ruleId = `r:${rule.key}`
  const trigger: GraphNode = {
    ...node(ruleId, 'trigger', text('GraphWhen', { what: triggerPhrase(snapshot, type, spec.trigger) }), branch, target, rule.name),
    state: waitingState(spec.trigger)
  }
  const nodes: GraphNode[] = [trigger]
  const edges: GraphEdge[] = []
  let previous = ruleId
  const last = spec.actions.at(-1)
  const before = last?.kind === 'requestApproval' ? spec.actions.slice(0, -1) : spec.actions
  if (last?.kind !== 'requestApproval' || before.length > 0) {
    const thenId = `${ruleId}:then`
    nodes.push({
      ...node(thenId, 'step', text('GraphThen'), branch, target),
      lines: stepLines(snapshot, type, before),
      state: last?.kind === 'requestApproval' ? undefined : landingState(spec.trigger, spec.actions)
    })
    edges.push(edge(previous, thenId, branch))
    previous = thenId
  }
  if (last?.kind !== 'requestApproval') return { nodes, edges }
  const approvalId = `${ruleId}:approval`
  nodes.push({
    ...node(approvalId, 'approval', text('GraphSendTo'), branch, target, approverPhrase(snapshot, type, last.from)),
    state: landingState(spec.trigger, spec.actions)
  })
  edges.push(edge(previous, approvalId, branch))
  const outcomes: Array<[Outcome, AutomationAction[], StringKey]> = [
    ['approved', spec.onApproved ?? [], 'GraphApproved'],
    ['rejected', spec.onRejected ?? [], 'GraphRejected']
  ]
  for (const [outcome, actions, label] of outcomes) {
    const stepId = `${ruleId}:${outcome}`
    nodes.push({
      ...node(stepId, 'step', text('GraphThen'), branch, target),
      lines: stepLines(snapshot, type, actions),
      state: landingState(spec.trigger, actions)
    })
    edges.push({ ...edge(approvalId, stepId, branch), label: text(label), outcome })
  }
  return { nodes, edges }
}

function processOf (snapshot: ConfigSnapshot, type: RecordTypeInfo): Subtree {
  const branch: Branch = 'process'
  const parentId = branchNodeId(branch)
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  for (const rule of type.automations) {
    const spec = rule.automation
    if (spec === null) {
      nodes.push(node(`r:${rule.key}`, 'hulyRule', rule.name, branch, { kind: 'hulyProcess', processId: rule.key }, text('GraphHulyRule')))
      edges.push(edge(parentId, `r:${rule.key}`, branch))
      continue
    }
    const chain = ruleChain(snapshot, type, rule, spec)
    nodes.push(...chain.nodes)
    edges.push(edge(parentId, `r:${rule.key}`, branch), ...chain.edges)
  }
  const add = node(`add:${branch}`, 'add', text(nodes.length === 0 ? 'GraphAddFirstStep' : 'GraphAddStep'), branch, { kind: 'rule', ruleKey: undefined })
  for (const parent of parentChain(snapshot, type)) {
    for (const rule of parent.automations) {
      const inherited = node(`ir:${parent.key}:${rule.key}`, 'inherited', rule.name, branch, { kind: 'openForm', typeKey: parent.key }, text('GraphInheritedRule', { name: parent.name }))
      nodes.push(inherited)
      edges.push(edge(parentId, inherited.id, branch))
    }
  }
  return { nodes: [...nodes, add], edges: [...edges, edge(parentId, add.id, branch)] }
}

function linksOf (snapshot: ConfigSnapshot, type: RecordTypeInfo): Subtree {
  const branch: Branch = 'links'
  const nodes = linkRows(snapshot, type).map((row) =>
    node(
      `l:${row.key}`,
      'link',
      `${row.fieldName} → ${row.targetName}`,
      branch,
      row.isReadOnly ? { kind: 'none' } : { kind: 'link', linkKey: row.key },
      text(row.isMany ? 'GraphLinkMany' : 'GraphLinkOne')
    )
  )
  nodes.push(node(`add:${branch}`, 'add', text('GraphAddLink'), branch, { kind: 'link', linkKey: undefined }))
  return under(branchNodeId(branch), branch, nodes)
}

function accessOf (snapshot: ConfigSnapshot, type: RecordTypeInfo): Subtree {
  const branch: Branch = 'access'
  const nodes = accessRows(snapshot, type)
    .filter((row) => row.viewer.length + row.editor.length + row.manager.length > 0)
    .map((row) =>
      node(
        `a:${row.space}`,
        'access',
        row.name,
        branch,
        { kind: 'access' },
        text('GraphAccessDetail', { viewer: row.viewer.length, editor: row.editor.length, manager: row.manager.length })
      )
    )
  nodes.push(node(`add:${branch}`, 'add', text('GraphChooseAccess'), branch, { kind: 'access' }))
  return under(branchNodeId(branch), branch, nodes)
}

export function formGraph (snapshot: ConfigSnapshot, typeKey: string, pendingTypeKeys: ReadonlySet<string>): Graph | undefined {
  const type = findType(snapshot, typeKey)
  if (type === undefined || type.isArchived || type.isSystem) return undefined
  const rootId = formNodeId(type.key)
  const root: GraphNode = {
    id: rootId,
    kind: 'form',
    label: type.name,
    detail: '',
    lines: [],
    chips: chipsOf(snapshot, type),
    state: undefined,
    branch: undefined,
    isPending: pendingTypeKeys.has(type.key),
    target: { kind: 'none' }
  }
  const subtrees: Record<Branch, Subtree> = {
    questions: questionsOf(snapshot, type),
    process: processOf(snapshot, type),
    links: linksOf(snapshot, type),
    access: accessOf(snapshot, type)
  }
  const nodes: GraphNode[] = [root]
  const edges: GraphEdge[] = []
  for (const branch of BRANCHES) {
    nodes.push(node(branchNodeId(branch), 'branch', text(BRANCH_LABEL[branch]), branch, { kind: 'none' }))
    edges.push(edge(rootId, branchNodeId(branch), branch))
    nodes.push(...subtrees[branch].nodes)
    edges.push(...subtrees[branch].edges)
  }
  return { nodes, edges: uniqueEdges(edges) }
}
