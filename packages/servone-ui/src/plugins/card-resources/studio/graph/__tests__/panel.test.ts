import { field, group, link, recordType, snapshotOf } from '../../__tests__/fixtures'
import { connectPanel, panelFor, typeKeyOfNode } from '../panel'

const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép', {
  fields: [field('so-ngay', 'Số ngày nghỉ', { kind: 'number' })],
  automations: [{ key: 'bao', name: 'Báo HR', sentences: [], automation: { name: 'Báo HR', trigger: { kind: 'created' }, actions: [] } }]
})
const staff = recordType('nhan-vien', 'Nhân viên')
const snapshot = snapshotOf({
  types: [leave, staff],
  groups: [group('thu-viec', 'Thông tin thử việc', 'nghi-phep', [field('mentor', 'Người kèm', { kind: 'person' })])],
  links: [link('gui', 'nghi-phep', 'nhan-vien', { fromName: 'Người gửi' })]
})

describe('panelFor', () => {
  it('opens the question editor for a form question, allowing a link only when new', () => {
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'question', owner: 'nghi-phep', fieldKey: 'so-ngay' })).toMatchObject({
      kind: 'field',
      owner: 'nghi-phep',
      ownerName: 'Đề nghị nghỉ phép',
      field: { key: 'so-ngay' },
      canLink: false
    })
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'question', owner: 'nghi-phep', fieldKey: undefined })).toMatchObject({
      kind: 'field',
      field: undefined,
      canLink: true
    })
  })

  it('edits a group question with the group as owner', () => {
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'question', owner: 'thu-viec', fieldKey: 'mentor' })).toMatchObject({
      kind: 'field',
      owner: 'thu-viec',
      ownerName: 'Thông tin thử việc',
      canLink: false
    })
  })

  it('opens the rule editor on an existing or a new rule', () => {
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'rule', ruleKey: 'bao' })).toMatchObject({ kind: 'rule', draft: { key: 'bao', name: 'Báo HR' } })
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'rule', ruleKey: undefined })).toMatchObject({ kind: 'rule', draft: { key: undefined } })
  })

  it('opens a connection or the new-connection dialog', () => {
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'link', linkKey: 'gui' })).toMatchObject({ kind: 'link', row: { key: 'gui' } })
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'link', linkKey: undefined })).toMatchObject({ kind: 'newLink', targetKey: '' })
  })

  it('stays closed when what the node points at is gone', () => {
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'question', owner: 'nghi-phep', fieldKey: 'da-xoa' })).toEqual({ kind: 'none' })
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'rule', ruleKey: 'da-xoa' })).toEqual({ kind: 'none' })
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'link', linkKey: 'da-xoa' })).toEqual({ kind: 'none' })
    expect(panelFor(snapshot, 'khong-co', { kind: 'access' })).toEqual({ kind: 'none' })
  })

  it('maps create and access targets', () => {
    expect(panelFor(snapshot, undefined, { kind: 'createType' })).toEqual({ kind: 'createType' })
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'access' })).toMatchObject({ kind: 'access', type: { key: 'nghi-phep' } })
  })

  it('opens no Studio editor for a process made in Huly', () => {
    expect(panelFor(snapshot, 'nghi-phep', { kind: 'hulyProcess', processId: 'p1' })).toEqual({ kind: 'none' })
  })
})

describe('connectPanel', () => {
  it('opens the connection dialog between two forms', () => {
    expect(typeKeyOfNode('type:nhan-vien')).toBe('nhan-vien')
    expect(typeKeyOfNode('add:type')).toBeUndefined()
    expect(connectPanel(snapshot, 'type:nghi-phep', 'type:nhan-vien')).toMatchObject({
      kind: 'newLink',
      type: { key: 'nghi-phep' },
      targetKey: 'nhan-vien'
    })
  })

  it('ignores drops on non-form boxes and on the same form', () => {
    expect(connectPanel(snapshot, 'type:nghi-phep', 'add:type')).toEqual({ kind: 'none' })
    expect(connectPanel(snapshot, 'type:nghi-phep', 'type:nghi-phep')).toEqual({ kind: 'none' })
  })
})
