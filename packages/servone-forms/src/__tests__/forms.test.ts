import core, { type AnyAttribute, type Class, type Doc, type Ref } from '@hcengineering/core'
import { IssuePriority, type IssueTemplate } from '@hcengineering/tracker'
import {
  answerHref,
  checkAnswers,
  composeDescription,
  fillIssue,
  parseFormDefinition,
  parseFormRecord,
  recordAnswers,
  serializeFormDefinition,
  serializeFormRecord,
  type FormDefinition,
  type FormField,
  type FormHierarchy
} from '..'

const field = (overrides: Partial<FormField> & Pick<FormField, 'id'>): FormField => ({
  label: overrides.id,
  isRequired: false,
  kind: 'text',
  target: { to: 'append' },
  ...overrides
})

const bugReport: FormDefinition = {
  version: 1,
  fields: [
    field({ id: 'summary', label: 'Summary', isRequired: true, target: { to: 'title' } }),
    field({ id: 'steps', label: 'Steps', kind: 'longText', target: { to: 'description' } }),
    field({ id: 'severity', label: 'Severity', kind: 'select', options: ['Urgent', 'High', 'Medium', 'Low'], target: { to: 'priority' } }),
    field({ id: 'due', label: 'Needed by', kind: 'date', target: { to: 'dueDate' } }),
    field({ id: 'browser', label: 'Browser' }),
    field({ id: 'contact', label: 'Email', kind: 'email' }),
    field({ id: 'points', label: 'Points', kind: 'number', target: { to: 'attribute', key: 'storyPoints' } })
  ]
}

describe('parseFormDefinition', () => {
  it('round-trips a valid form', () => {
    expect(parseFormDefinition(serializeFormDefinition(bugReport))).toEqual({ isValid: true, definition: bugReport })
  })

  it('rejects malformed JSON and unknown versions', () => {
    expect(parseFormDefinition('{')).toEqual({ isValid: false, issue: { problem: 'invalid_json' } })
    expect(parseFormDefinition('{"version":2,"fields":[]}')).toEqual({ isValid: false, issue: { problem: 'unknown_version' } })
  })

  it('rejects a kind that cannot fill its target', () => {
    const form = { version: 1, fields: [field({ id: 'a', kind: 'number', target: { to: 'title' } })] }
    expect(parseFormDefinition(JSON.stringify(form))).toEqual({ isValid: false, issue: { problem: 'target_mismatch', field: 0 } })
  })

  it('rejects two fields filling the same target, but allows many appended ones', () => {
    const twoTitles = { version: 1, fields: [field({ id: 'a', target: { to: 'title' } }), field({ id: 'b', target: { to: 'title' } })] }
    expect(parseFormDefinition(JSON.stringify(twoTitles))).toEqual({ isValid: false, issue: { problem: 'duplicate_target', field: 1 } })
    const twoAppended = { version: 1, fields: [field({ id: 'a' }), field({ id: 'b' })] }
    expect(parseFormDefinition(JSON.stringify(twoAppended)).isValid).toBe(true)
  })

  it('requires the fixed option list on a priority field', () => {
    const form = { version: 1, fields: [field({ id: 'p', kind: 'select', options: ['Low', 'High'], target: { to: 'priority' } })] }
    expect(parseFormDefinition(JSON.stringify(form))).toEqual({ isValid: false, issue: { problem: 'invalid_option', field: 0 } })
  })
})

describe('checkAnswers', () => {
  it('reports every bad answer by field id', () => {
    const checked = checkAnswers(
      bugReport,
      new Map([
        ['severity', 'Blocker'],
        ['due', '2026-02-30'],
        ['contact', 'nobody'],
        ['points', '3 points']
      ])
    )
    expect(checked).toEqual({
      isValid: false,
      problems: new Map([
        ['summary', 'required'],
        ['severity', 'invalid_option'],
        ['due', 'invalid_date'],
        ['contact', 'invalid_email'],
        ['points', 'invalid_number']
      ])
    })
  })

  it('skips empty optional answers and flattens line breaks outside long text', () => {
    const checked = checkAnswers(bugReport, new Map([['summary', '  Login\r\nfails  '], ['browser', '']]))
    expect(checked).toEqual({
      isValid: true,
      answers: [{ field: bugReport.fields[0], value: { type: 'text', text: 'Login fails' } }]
    })
  })

  it('caps a title answer at the create dialog limit', () => {
    const checked = checkAnswers(bugReport, new Map([['summary', 'x'.repeat(256)]]))
    expect(checked).toEqual({ isValid: false, problems: new Map([['summary', 'too_long']]) })
  })
})

describe('fillIssue', () => {
  const issueClass = 'tracker:class:Issue' as Ref<Class<Doc>>
  const points: AnyAttribute = {
    _id: 'attr-points' as Ref<AnyAttribute>,
    _class: core.class.Attribute,
    space: core.space.Model,
    modifiedOn: 0,
    modifiedBy: core.account.System,
    label: core.string.Number,
    name: 'storyPoints',
    attributeOf: issueClass,
    isCustom: true,
    type: { _class: core.class.TypeNumber, label: core.string.Number }
  }
  const hierarchy: FormHierarchy = {
    findAttribute: (_cls, name) => (name === 'storyPoints' ? points : undefined),
    getAllAttributes: () => new Map([['storyPoints', points]]),
    isMixin: () => false
  }

  it('maps answers onto issue fields and leaves unmapped ones out of the description', () => {
    const checked = checkAnswers(
      bugReport,
      new Map([
        ['summary', 'Login fails'],
        ['steps', 'Open app\n\nClick login'],
        ['severity', 'High'],
        ['due', '2026-10-01'],
        ['browser', 'Firefox'],
        ['points', '3']
      ])
    )
    if (!checked.isValid) throw new Error('expected valid answers')
    const fill = fillIssue(hierarchy, issueClass, checked.answers)
    expect(fill.title).toBe('Login fails')
    expect(fill.priority).toBe(IssuePriority.High)
    expect(fill.dueDate).toBe(Date.UTC(2026, 9, 1, 12))
    expect(fill.onIssue).toEqual(new Map([['storyPoints', 3]]))
    expect(composeDescription(fill, [])).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Open app' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Click login' }] }
      ]
    })
  })

  it('skips an answer whose attribute no longer exists', () => {
    const lost = { ...bugReport, fields: [field({ id: 'x', label: 'Team', target: { to: 'attribute', key: 'gone' } })] }
    const checked = checkAnswers(lost, new Map([['x', 'Core']]))
    if (!checked.isValid) throw new Error('expected valid answers')
    const fill = fillIssue(hierarchy, issueClass, checked.answers)
    expect(fill.onIssue.size).toBe(0)
    expect(composeDescription(fill, [])).toEqual({ type: 'doc', content: [] })
  })
})

describe('recordAnswers', () => {
  const template = 'template-1' as Ref<IssueTemplate>

  it('keeps every question in form order, unanswered ones empty', () => {
    const checked = checkAnswers(
      bugReport,
      new Map([
        ['summary', 'Login fails'],
        ['contact', 'ann@example.com'],
        ['due', '2026-10-01'],
        ['points', '3']
      ])
    )
    if (!checked.isValid) throw new Error('expected valid answers')
    const record = recordAnswers(bugReport, [...checked.answers].reverse(), template, 1000)
    expect(record).toEqual({
      version: 1,
      template,
      submittedOn: 1000,
      answers: [
        { id: 'summary', label: 'Summary', kind: 'text', text: 'Login fails' },
        { id: 'steps', label: 'Steps', kind: 'longText', text: '' },
        { id: 'severity', label: 'Severity', kind: 'select', text: '' },
        { id: 'due', label: 'Needed by', kind: 'date', text: '2026-10-01' },
        { id: 'browser', label: 'Browser', kind: 'text', text: '' },
        { id: 'contact', label: 'Email', kind: 'email', text: 'ann@example.com' },
        { id: 'points', label: 'Points', kind: 'number', text: '3' }
      ]
    })
    expect(parseFormRecord(serializeFormRecord(record))).toEqual(record)
  })

  it('reads nothing from a missing or malformed record', () => {
    expect(parseFormRecord(undefined)).toBeUndefined()
    expect(parseFormRecord('{')).toBeUndefined()
    expect(parseFormRecord('{"version":1,"template":"t","submittedOn":1,"answers":[{"id":"a"}]}')).toBeUndefined()
    expect(parseFormRecord('{"version":2,"template":"t","submittedOn":1,"answers":[]}')).toBeUndefined()
  })
})

describe('answerHref', () => {
  const answer = (kind: FormField['kind'], text: string): Parameters<typeof answerHref>[0] => ({ id: 'a', label: 'A', kind, text })

  it('links emails and web addresses only', () => {
    expect(answerHref(answer('email', 'ann@example.com'))).toBe('mailto:ann@example.com')
    expect(answerHref(answer('text', 'https://example.com/cv.pdf'))).toBe('https://example.com/cv.pdf')
    expect(answerHref(answer('text', 'javascript:alert(1)'))).toBeUndefined()
    expect(answerHref(answer('text', 'see https://example.com'))).toBeUndefined()
    expect(answerHref(answer('email', ''))).toBeUndefined()
  })
})
