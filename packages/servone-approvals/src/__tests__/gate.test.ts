import core, { TxFactory, TxProcessor, type PersonId, type Ref, type Status } from '@hcengineering/core'
import task, { type ProjectType, type ProjectTypeDescriptor, type TaskType } from '@hcengineering/task'
import { gateRefusal, statusApproval } from '..'

const [assigned, changeApproval, inProgress, resolved, closed, canceled] = [
  'Assigned',
  'ChangeApproval',
  'InProgress',
  'Resolved',
  'Closed',
  'Canceled'
] as Array<Ref<Status>>
const order = [assigned, changeApproval, inProgress, resolved, closed, canceled]
const gates = new Set([changeApproval])
const isCanceled = (status: Ref<Status>): boolean => status === canceled

describe('gateRefusal', () => {
  it('refuses leaving a gate', () => {
    expect(gateRefusal(order, gates, changeApproval, inProgress, isCanceled)).toBe(true)
    expect(gateRefusal(order, gates, changeApproval, assigned, isCanceled)).toBe(true)
  })

  it('refuses jumping past a gate and allows moving into it', () => {
    expect(gateRefusal(order, gates, assigned, inProgress, isCanceled)).toBe(true)
    expect(gateRefusal(order, gates, assigned, changeApproval, isCanceled)).toBe(false)
  })

  it('allows canceling, even out of a gate', () => {
    expect(gateRefusal(order, gates, changeApproval, canceled, isCanceled)).toBe(false)
  })

  it('refuses reopening from Canceled past a gate', () => {
    expect(gateRefusal(order, gates, canceled, inProgress, isCanceled)).toBe(true)
    expect(gateRefusal(order, gates, canceled, assigned, isCanceled)).toBe(false)
  })

  it('allows moves after the gate, and backward moves that do not leave a gate', () => {
    expect(gateRefusal(order, gates, resolved, closed, isCanceled)).toBe(false)
    expect(gateRefusal(order, gates, closed, inProgress, isCanceled)).toBe(false)
  })

  it('on create, refuses a target past a gate', () => {
    expect(gateRefusal(order, gates, undefined, inProgress, isCanceled)).toBe(true)
    expect(gateRefusal(order, gates, undefined, changeApproval, isCanceled)).toBe(false)
  })
})

describe('statusApproval', () => {
  const factory = new TxFactory('test:person' as PersonId)
  const taskType = 'test:taskType:Change' as Ref<TaskType>
  function typeWith (servoneApproval: object): ProjectType {
    const gate = { _id: changeApproval, taskType, servoneApproval }
    return TxProcessor.createDoc2Doc(
      factory.createTxCreateDoc(task.class.ProjectType, core.space.Model, {
        name: 'Change',
        descriptor: 'test:descriptor:Project' as Ref<ProjectTypeDescriptor>,
        tasks: [],
        description: '',
        roles: 0,
        targetClass: task.class.Project,
        classic: false,
        statuses: [{ _id: assigned, taskType }, gate]
      })
    )
  }

  it('reads a marked status and ignores unmarked ones', () => {
    const projectType = typeWith({ by: 'person', person: 'test:person:lead' })
    expect(statusApproval(projectType, changeApproval)).toEqual({ by: 'person', person: 'test:person:lead' })
    expect(statusApproval(projectType, assigned)).toBeUndefined()
  })

  it('reads a malformed marker as manager', () => {
    expect(statusApproval(typeWith({ by: 'person' }), changeApproval)).toEqual({ by: 'manager' })
    expect(statusApproval(typeWith({ by: 'boss' }), changeApproval)).toEqual({ by: 'manager' })
  })
})
