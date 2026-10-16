import { newDraft, type FieldDraft } from '../../fields'
import { field } from '../../__tests__/fixtures'
import { questionKindLabel } from '../phrases'
import { kindHint, previewRows, QUESTION_KINDS, questionNodeId } from '../question'

const reason = field('ly-do', 'Lý do', { kind: 'longText' }, { isRequired: true })
const days = field('so-ngay', 'Số ngày', { kind: 'number' })

describe('question kinds', () => {
  it('offers the nine stock answer kinds, without money', () => {
    expect(QUESTION_KINDS).toEqual(['text', 'longText', 'number', 'person', 'date', 'boolean', 'select', 'multiSelect', 'autoNumber'])
    expect(kindHint('person')).toBe('Chọn đồng nghiệp')
  })
})

describe('previewRows', () => {
  it('adds a new question last and marks it', () => {
    const draft = { ...newDraft(), name: ' Người bàn giao ', kind: { kind: 'person' } } satisfies FieldDraft
    expect(previewRows([reason, days], undefined, draft)).toEqual([
      { key: 'ly-do', name: 'Lý do', kindLabel: questionKindLabel('longText'), isRequired: true, isEdited: false },
      { key: 'so-ngay', name: 'Số ngày', kindLabel: questionKindLabel('number'), isRequired: false, isEdited: false },
      { key: '', name: 'Người bàn giao', kindLabel: questionKindLabel('person'), isRequired: false, isEdited: true }
    ])
  })

  it('shows an edited question in place, untitled while empty', () => {
    const draft = { ...newDraft(), name: '', kind: { kind: 'number' }, isRequired: true } satisfies FieldDraft
    expect(previewRows([reason, days], days, draft).map((it) => [it.name, it.isRequired, it.isEdited])).toEqual([
      ['Lý do', true, false],
      ['Câu hỏi chưa đặt tên', true, true]
    ])
  })
})

describe('questionNodeId', () => {
  it('matches the form map ids', () => {
    expect(questionNodeId('nghi-phep', 'nghi-phep', 'ly-do')).toBe('q:ly-do')
    expect(questionNodeId('nghi-phep', 'thu-viec', 'mentor')).toBe('gq:thu-viec:mentor')
  })
})
