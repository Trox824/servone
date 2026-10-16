import { parseSetAutomation, readRule } from '../automation'
import { type JsonObject, JsonReader } from '../json'
import { toAccountUuid } from '../keys'
import type { AutomationSpec, SetAutomationOp } from '../operations'

function parse (source: JsonObject): { op: SetAutomationOp, problems: string[] } {
  const reader = new JsonReader(source)
  const op = parseSetAutomation(reader)
  return { op, problems: reader.problems }
}

describe('parseSetAutomation', () => {
  it('reads every trigger and action kind', () => {
    const { op, problems } = parse({
      op: 'setAutomation',
      type: 'nghi-phep',
      key: 'tam-ung',
      automation: {
        name: 'Tạm ứng công tác',
        trigger: { kind: 'fieldChanged', field: 'trang-thai', to: 'Đã nộp' },
        actions: [
          { kind: 'setField', field: 'tam-ung', value: null },
          {
            kind: 'createLinked',
            type: 'cong-tac-phi',
            link: 'nghi-phep-cong-tac-phi',
            title: 'Tạm ứng',
            values: [{ field: 'so-tien', value: 2000000 }]
          },
          { kind: 'lockField', fields: ['ngay-bat-dau'] },
          { kind: 'lockRecord' },
          { kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } }
        ],
        onApproved: [{ kind: 'createTodo', title: 'Chuyển tiền', assignee: { kind: 'people', people: ['lan-uuid'] } }],
        onRejected: [{ kind: 'setField', field: 'khan', value: false }]
      }
    })
    expect(problems).toEqual([])
    expect(op).toEqual({
      op: 'setAutomation',
      type: 'nghi-phep',
      key: 'tam-ung',
      automation: {
        name: 'Tạm ứng công tác',
        trigger: { kind: 'fieldChanged', field: 'trang-thai', to: 'Đã nộp' },
        actions: [
          { kind: 'setField', field: 'tam-ung', value: null },
          {
            kind: 'createLinked',
            type: 'cong-tac-phi',
            link: 'nghi-phep-cong-tac-phi',
            title: 'Tạm ứng',
            values: [{ field: 'so-tien', value: 2000000 }]
          },
          { kind: 'lockField', fields: ['ngay-bat-dau'] },
          { kind: 'lockRecord' },
          { kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } }
        ],
        onApproved: [
          { kind: 'createTodo', title: 'Chuyển tiền', assignee: { kind: 'people', people: [toAccountUuid('lan-uuid')] } }
        ],
        onRejected: [{ kind: 'setField', field: 'khan', value: false }]
      }
    })
  })

  it('reads date triggers, field targets and removal', () => {
    const dated = parse({
      op: 'setAutomation',
      type: 'nghi-phep',
      key: 'nhac',
      automation: {
        name: 'Nhắc',
        trigger: { kind: 'date', field: 'ngay-bat-dau', offsetDays: -3 },
        actions: [{ kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } }]
      }
    })
    expect(dated.problems).toEqual([])
    expect(dated.op.automation).toEqual({
      name: 'Nhắc',
      trigger: { kind: 'date', field: 'ngay-bat-dau', offsetDays: -3 },
      actions: [{ kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } }]
    })
    const removed = parse({ op: 'setAutomation', type: 'nghi-phep', key: 'nhac', automation: null })
    expect(removed).toEqual({ op: { op: 'setAutomation', type: 'nghi-phep', key: 'nhac', automation: null }, problems: [] })
  })

  it('reports readable problems', () => {
    const { problems } = parse({
      op: 'setAutomation',
      type: 'nghi-phep',
      key: 'x',
      automation: {
        name: 'X',
        trigger: { kind: 'khi-nao' },
        actions: [
          { kind: 'guiMail' },
          { kind: 'requestApproval', from: { kind: 'preset', preset: 'boss' } },
          { kind: 'setField', field: 'a', value: [1] }
        ]
      }
    })
    expect(problems).toEqual([
      'automation.trigger.kind: cần "created", "fieldChanged" hoặc "date"',
      'automation.actions[0].kind: cần "requestApproval", "setField", "createLinked", "createTodo", "lockField" hoặc "lockRecord"',
      'automation.actions[1].from.preset: cần "viewer", "editor" hoặc "manager"',
      'automation.actions[2].value: cần chuỗi, số, true/false hoặc null'
    ])
  })

  it('reads connected-form and creator targets', () => {
    const { op, problems } = parse({
      op: 'setAutomation',
      type: 'nghi-phep',
      key: 'duyet',
      automation: {
        name: 'Duyệt qua công tác phí',
        trigger: { kind: 'created' },
        actions: [{ kind: 'requestApproval', from: { kind: 'linked', link: 'nghi-phep-cong-tac-phi', field: 'ke-toan' } }],
        onRejected: [{ kind: 'createTodo', title: 'Sửa lại đề nghị', assignee: { kind: 'initiator' } }]
      }
    })
    expect(problems).toEqual([])
    expect(op.automation).toEqual({
      name: 'Duyệt qua công tác phí',
      trigger: { kind: 'created' },
      actions: [{ kind: 'requestApproval', from: { kind: 'linked', link: 'nghi-phep-cong-tac-phi', field: 'ke-toan' } }],
      onRejected: [{ kind: 'createTodo', title: 'Sửa lại đề nghị', assignee: { kind: 'initiator' } }]
    })
    const wrong = parse({
      op: 'setAutomation',
      type: 'nghi-phep',
      key: 'x',
      automation: { name: 'X', trigger: { kind: 'created' }, actions: [{ kind: 'requestApproval', from: { kind: 'sep' } }] }
    })
    expect(wrong.problems).toEqual(['automation.actions[0].from.kind: cần "field", "people", "preset", "linked" hoặc "initiator"'])
  })
})

describe('readRule', () => {
  it('round-trips the stored rule text and refuses anything else', () => {
    const spec: AutomationSpec = {
      name: 'Đánh dấu đã nộp',
      trigger: { kind: 'created' },
      actions: [{ kind: 'setField', field: 'trang-thai', value: 'Đã nộp' }]
    }
    expect(readRule(JSON.stringify(spec))).toEqual(spec)
    expect(readRule(undefined)).toBeNull()
    expect(readRule('{')).toBeNull()
    expect(readRule('{"name":"X"}')).toBeNull()
  })
})
