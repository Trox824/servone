import { defaultFarName } from '../../links'
import { recordType, snapshotOf } from '../../__tests__/fixtures'
import { connectedType, connectedTypeIssues, dropPanel } from '../connect'

const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép', { spaces: ['s1'] })
const dept = recordType('phong-ban', 'Phòng ban')
const snapshot = snapshotOf({ types: [leave, dept] })

describe('dropPanel', () => {
  it('connects when the "+" lands on another form', () => {
    expect(dropPanel(snapshot, 'type:nghi-phep', { kind: 'node', nodeId: 'type:phong-ban' })).toEqual({
      kind: 'newLink',
      type: leave,
      targetKey: 'phong-ban'
    })
  })

  it('creates a connected form on a click or a drop on empty canvas', () => {
    expect(dropPanel(snapshot, 'type:nghi-phep', { kind: 'node', nodeId: 'type:nghi-phep' })).toEqual({ kind: 'newConnectedType', type: leave })
    expect(dropPanel(snapshot, 'type:nghi-phep', { kind: 'pane' })).toEqual({ kind: 'newConnectedType', type: leave })
  })

  it('ignores anything that is not a form', () => {
    expect(dropPanel(snapshot, 'add:type', { kind: 'pane' })).toEqual({ kind: 'none' })
    expect(dropPanel(snapshot, 'type:nghi-phep', { kind: 'node', nodeId: 'add:type' })).toEqual({ kind: 'none' })
  })
})

describe('connectedType', () => {
  it('asks for a name no active form uses', () => {
    expect(connectedTypeIssues(snapshot, '  ')).toEqual(['Hãy đặt tên biểu mẫu'])
    expect(connectedTypeIssues(snapshot, ' phòng ban ')).toEqual(['Đã có biểu mẫu tên này'])
    expect(connectedTypeIssues(snapshot, 'Công tác phí')).toEqual([])
  })

  it('creates the form in the same spaces and connects it in one save', () => {
    expect(connectedType(snapshot, leave, ' Công tác phí ')).toEqual({
      typeKey: 'cong-tac-phi',
      ops: [
        { op: 'createType', key: 'cong-tac-phi', name: 'Công tác phí', spaces: ['s1'] },
        {
          op: 'addLink',
          key: 'de-nghi-nghi-phep-cong-tac-phi',
          from: 'nghi-phep',
          to: 'cong-tac-phi',
          fromName: 'Công tác phí',
          toName: defaultFarName('Đề nghị nghỉ phép'),
          fromMany: false,
          toMany: true
        }
      ]
    })
  })
})
