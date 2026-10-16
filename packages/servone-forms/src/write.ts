import core, {
  type Class,
  type DocumentUpdate,
  type MixinData,
  type Ref,
  type Space,
  type TxOperations,
  type Type
} from '@hcengineering/core'
import { getEmbeddedLabel } from '@hcengineering/platform'
import tags, { type TagElement } from '@hcengineering/tags'
import tracker, { type Issue, type IssueStatus, type IssueTemplate } from '@hcengineering/tracker'
import { parseFormDefinition, type FormDefinition } from './definition'
import type { IssueFill } from './fill'

// The stock transactor never loads a Servone model, so these are custom attributes created at runtime.
export const FORM_ATTR = 'servoneForm' satisfies keyof FormTemplate
export const FORM_STATUS_ATTR = 'servoneFormStatus' satisfies keyof FormTemplate
export const ANSWERS_ATTR = 'servoneFormAnswers' satisfies keyof FormIssue

export interface FormTemplate extends IssueTemplate {
  servoneForm?: string
  // null means the project's default status.
  servoneFormStatus?: Ref<IssueStatus> | null
}

export const formTemplateClass: Ref<Class<FormTemplate>> = tracker.class.IssueTemplate

export interface FormIssue extends Issue {
  // A serialized FormRecord (record.ts).
  servoneFormAnswers?: string
}

export const formIssueClass: Ref<Class<FormIssue>> = tracker.class.Issue

// Undefined for a plain template, or one whose stored form no longer parses.
export function templateForm (template: Pick<FormTemplate, 'servoneForm'>): FormDefinition | undefined {
  if (template.servoneForm === undefined || template.servoneForm === '') return undefined
  const parsed = parseFormDefinition(template.servoneForm)
  return parsed.isValid && parsed.definition.fields.length > 0 ? parsed.definition : undefined
}

export const VIA_FORM_LABEL = 'via form'
const VIA_FORM_COLOR = 9 // index into the stock label palette (ui/src/colors.ts)

const stringType: Type<string> = { _class: core.class.TypeString, label: core.string.String }

// Model write: needs the system account or a workspace maintainer.
export async function ensureFormAttributes (client: TxOperations): Promise<void> {
  const wanted = [
    { attributeOf: tracker.class.IssueTemplate, name: FORM_ATTR, label: 'Form' },
    { attributeOf: tracker.class.IssueTemplate, name: FORM_STATUS_ATTR, label: 'Form status' },
    { attributeOf: tracker.class.Issue, name: ANSWERS_ATTR, label: 'Form answers' }
  ]
  const existing = await client.findAll(core.class.Attribute, {
    attributeOf: { $in: [tracker.class.IssueTemplate, tracker.class.Issue] },
    name: { $in: wanted.map(({ name }) => name) }
  })
  for (const { attributeOf, name, label } of wanted) {
    if (existing.some((attribute) => attribute.attributeOf === attributeOf && attribute.name === name)) continue
    await client.createDoc(core.class.Attribute, core.space.Model, {
      attributeOf,
      name,
      label: getEmbeddedLabel(label),
      type: stringType,
      isCustom: true,
      hidden: true
    })
  }
}

export type FormLabel = Pick<TagElement, '_id' | 'title' | 'color'>

export async function viaFormLabel (client: TxOperations): Promise<FormLabel> {
  const query = { title: VIA_FORM_LABEL, targetClass: tracker.class.Issue }
  const existing = await client.findOne(tags.class.TagElement, query)
  if (existing !== undefined) return existing
  const _id = await client.createDoc(tags.class.TagElement, core.space.Workspace, {
    ...query,
    description: '',
    color: VIA_FORM_COLOR,
    category: tracker.category.Other
  })
  return { _id, title: VIA_FORM_LABEL, color: VIA_FORM_COLOR }
}

// Runs after the issue exists: custom attribute values and the "via form" label.
export async function writeFormExtras (
  ops: TxOperations,
  issue: Ref<Issue>,
  space: Ref<Space>,
  fill: IssueFill,
  label: FormLabel
): Promise<void> {
  if (fill.onIssue.size > 0) {
    const update: DocumentUpdate<Issue> = {}
    await ops.updateDoc(tracker.class.Issue, space, issue, Object.assign(update, Object.fromEntries(fill.onIssue)))
  }
  for (const [mixin, values] of fill.byMixin) {
    const mixinValues: MixinData<Issue, Issue> = {}
    await ops.createMixin(issue, tracker.class.Issue, space, mixin, Object.assign(mixinValues, Object.fromEntries(values)))
  }
  await ops.addCollection(tags.class.TagReference, space, issue, tracker.class.Issue, 'labels', {
    title: label.title,
    color: label.color,
    tag: label._id
  })
}
