import core, { type AnyAttribute, type Class, type Doc, type Hierarchy, type Mixin, type Ref } from '@hcengineering/core'
import { nodeDoc, nodeParagraph, nodeText, type MarkupNode } from '@hcengineering/text-core'
import type { Issue, IssuePriority } from '@hcengineering/tracker'
import { answerText, type Answer, type AnswerValue } from './answers'
import { PRIORITY_BY_OPTION, PRIORITY_OPTIONS, type FormFieldKind } from './definition'

export type AttributeValue = string | number
export type FormHierarchy = Pick<Hierarchy, 'findAttribute' | 'getAllAttributes' | 'isMixin'>

export interface IssueFill {
  title: string | undefined
  priority: IssuePriority | undefined
  dueDate: number | undefined
  onIssue: Map<string, AttributeValue>
  byMixin: Map<Ref<Mixin<Issue>>, Map<string, AttributeValue>>
  // Goes above what the person typed into the description editor.
  lead: MarkupNode[]
}

// Which form field kinds can fill an attribute of this type; empty means forms can't target it.
export function kindsForAttribute (attribute: AnyAttribute): FormFieldKind[] {
  switch (attribute.type._class) {
    case core.class.TypeString:
      return ['text', 'longText', 'email', 'select']
    case core.class.TypeNumber:
      return ['number']
    case core.class.TypeDate:
    case core.class.TypeTimestamp:
      return ['date']
    default:
      return []
  }
}

// Custom attributes a form can target on issues of this task type (its mixin plus Issue itself).
export function formAttributes (hierarchy: FormHierarchy, targetClass: Ref<Class<Doc>>): AnyAttribute[] {
  return [...hierarchy.getAllAttributes(targetClass).values()].filter(
    (attribute) => attribute.isCustom === true && attribute.hidden !== true && kindsForAttribute(attribute).length > 0
  )
}

function attributeValue (value: AnswerValue): AttributeValue {
  switch (value.type) {
    case 'text':
      return value.text
    case 'number':
      return value.number
    case 'date':
      return value.at
  }
}

function lines (text: string): MarkupNode[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => nodeParagraph(nodeText(line)))
}

function priorityOf (text: string): IssuePriority | undefined {
  const option = PRIORITY_OPTIONS.find((candidate) => candidate === text)
  return option === undefined ? undefined : PRIORITY_BY_OPTION[option]
}

// `targetClass` is the task type's mixin (or tracker Issue); attribute keys resolve against it at write time,
// so an attribute deleted or retyped after the form was built is skipped; the answer survives in the form record.
export function fillIssue (hierarchy: FormHierarchy, targetClass: Ref<Class<Doc>>, answers: Answer[]): IssueFill {
  const fill: IssueFill = {
    title: undefined,
    priority: undefined,
    dueDate: undefined,
    onIssue: new Map(),
    byMixin: new Map(),
    lead: []
  }
  for (const answer of answers) {
    const { target } = answer.field
    const text = answerText(answer.value)
    switch (target.to) {
      case 'title':
        fill.title = text
        break
      case 'description':
        fill.lead.push(...lines(text))
        break
      case 'priority':
        fill.priority = priorityOf(text)
        break
      case 'dueDate':
        if (answer.value.type === 'date') fill.dueDate = answer.value.at
        break
      case 'attribute':
        addAttribute(hierarchy, targetClass, fill, target.key, answer)
        break
      case 'append':
        break
    }
  }
  return fill
}

function addAttribute (
  hierarchy: FormHierarchy,
  targetClass: Ref<Class<Doc>>,
  fill: IssueFill,
  key: string,
  answer: Answer
): void {
  const attribute = hierarchy.findAttribute(targetClass, key)
  if (attribute === undefined || !kindsForAttribute(attribute).includes(answer.field.kind)) return
  const value = attributeValue(answer.value)
  if (!hierarchy.isMixin(attribute.attributeOf)) {
    fill.onIssue.set(key, value)
    return
  }
  // isMixin above narrows what attributeOf points at; the Ref type itself can't carry that.
  const mixin = attribute.attributeOf as Ref<Mixin<Issue>>
  const values = fill.byMixin.get(mixin) ?? new Map<string, AttributeValue>()
  values.set(key, value)
  fill.byMixin.set(mixin, values)
}

export function composeDescription (fill: IssueFill, typed: MarkupNode[]): MarkupNode {
  return nodeDoc(...fill.lead, ...typed)
}
