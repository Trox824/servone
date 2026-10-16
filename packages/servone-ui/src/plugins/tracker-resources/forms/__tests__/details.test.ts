import type { Ref } from '@hcengineering/core'
import {
  FORM_RECORD_VERSION,
  FORM_VERSION,
  serializeFormDefinition,
  type FormField,
  type FormRecord,
  type FormTemplate,
  type RecordedAnswer
} from '@servone/forms'
import { detailAnswers, detailRows, isMissing, itemForm, withAnswer, type ItemForm } from '../details'

const answer = (id: string, text: string): RecordedAnswer => ({ id, label: id, kind: 'text', text })

const field = (id: string, isRequired = false): FormField => ({ id, label: id, isRequired, kind: 'text', target: { to: 'append' } })
const titleField: FormField = { id: 'name', label: 'Name', isRequired: true, kind: 'text', target: { to: 'title' } }

const templateRef = (id: string): Ref<FormTemplate> => id as Ref<FormTemplate>

function template (id: string, fields: FormField[] | undefined): Pick<FormTemplate, '_id' | 'servoneForm'> {
  const servoneForm = fields === undefined ? undefined : serializeFormDefinition({ version: FORM_VERSION, fields })
  return { _id: templateRef(id), servoneForm }
}

const form = (fields: FormField[]): ItemForm => ({ template: templateRef('hire'), definition: { version: FORM_VERSION, fields } })

const record = (answers: RecordedAnswer[]): FormRecord => ({
  version: FORM_RECORD_VERSION,
  template: templateRef('hire'),
  submittedOn: 1,
  answers
})

describe('detailAnswers', () => {
  it('drops the answer that became the item title', () => {
    const answers = [answer('candidate', ' Nguyen Van A '), answer('position', 'Designer')]
    expect(detailAnswers(answers, 'Nguyen Van A').map((shown) => shown.id)).toEqual(['position'])
  })

  it('keeps every answer once the title was edited', () => {
    const answers = [answer('candidate', 'Nguyen Van A'), answer('position', 'Designer')]
    expect(detailAnswers(answers, 'Hire designer')).toHaveLength(2)
  })

  it('keeps unanswered questions even when the title is empty', () => {
    expect(detailAnswers([answer('note', '')], '')).toHaveLength(1)
  })
})

describe('itemForm', () => {
  const templates = [template('plain', undefined), template('empty', []), template('buy', [field('a')]), template('hire', [field('b')])]

  it('takes the first template with questions when the item has no record', () => {
    expect(itemForm(templates, undefined)?.template).toBe('buy')
  })

  it('takes the recorded template', () => {
    expect(itemForm(templates, record([]))?.template).toBe('hire')
  })

  it('finds none once the recorded template is gone', () => {
    expect(itemForm(templates.slice(0, 3), record([]))).toBeUndefined()
  })
})

describe('detailRows', () => {
  it('lists current questions in form order, skipping the title', () => {
    const rows = detailRows(form([titleField, field('b'), field('a')]), record([answer('a', 'x')]), 'Title')
    expect(rows.map((row) => [row.answer.id, row.answer.text])).toEqual([['b', ''], ['a', 'x']])
  })

  it('keeps a removed question read-only after the current ones', () => {
    const rows = detailRows(form([field('a')]), record([answer('gone', 'old'), answer('a', 'x')]), 'Title')
    expect(rows.map((row) => [row.answer.id, row.field === undefined])).toEqual([['a', false], ['gone', true]])
  })
})

describe('isMissing', () => {
  it('flags only empty required questions', () => {
    const rows = detailRows(form([field('a', true), field('b', true), field('c')]), record([answer('a', ' x ')]), '')
    expect(rows.filter(isMissing).map((row) => row.answer.id)).toEqual(['b'])
  })

  it('ignores removed questions', () => {
    expect(detailRows(undefined, record([answer('gone', '')]), 'Title').filter(isMissing)).toEqual([])
  })
})

describe('withAnswer', () => {
  it('starts a record with every question for an item filed without the form', () => {
    const updated = withAnswer(undefined, form([titleField, field('a')]), 42, 'a', 'x')
    expect(updated).toEqual({
      version: FORM_RECORD_VERSION,
      template: 'hire',
      submittedOn: 42,
      answers: [
        { id: 'name', label: 'Name', kind: 'text', text: '' },
        { id: 'a', label: 'a', kind: 'text', text: 'x' }
      ]
    })
  })

  it('follows the current form and keeps removed answers', () => {
    const renamed = { ...field('a'), label: 'Renamed ' }
    const updated = withAnswer(record([answer('gone', 'old'), answer('a', 'x')]), form([field('b'), renamed]), 42, 'b', 'y')
    expect(updated.submittedOn).toBe(1)
    expect(updated.answers.map((kept) => [kept.id, kept.label, kept.text])).toEqual([
      ['b', 'b', 'y'],
      ['a', 'Renamed', 'x'],
      ['gone', 'gone', 'old']
    ])
  })
})
