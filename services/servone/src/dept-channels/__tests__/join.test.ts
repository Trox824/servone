import type { Channel } from '@hcengineering/chunter'
import type { Employee } from '@hcengineering/contact'
import core, {
  TxFactory,
  type AccountUuid,
  type Class,
  type DocumentUpdate,
  type PersonId,
  type Ref
} from '@hcengineering/core'
import hr, { type Department } from '@hcengineering/hr'
import type { ProjectType } from '@hcengineering/task'
import tracker, { type Project, TimeReportDayType } from '@hcengineering/tracker'
import {
  planJoins,
  readDepartmentEvent,
  type SpaceMembers,
  type DepartmentWithChannels,
  type ProjectWithSync
} from '../join'

const factory = new TxFactory('test' as PersonId)
const sales = 'sales' as Ref<Department>
const ann = 'ann' as Ref<Employee>
const bob = 'bob' as Ref<Employee>
const general = 'general' as Ref<Channel>

function update (operations: DocumentUpdate<DepartmentWithChannels>): ReturnType<typeof readDepartmentEvent> {
  return readDepartmentEvent(
    factory.createTxUpdateDoc<DepartmentWithChannels>(hr.class.Department, core.space.Workspace, sales, operations)
  )
}

describe('readDepartmentEvent', () => {
  it('reads a single pushed member', () => {
    expect(update({ $push: { members: ann } })).toEqual({ kind: 'membersAdded', department: sales, employees: [ann] })
  })

  it('reads members pushed with $each', () => {
    expect(update({ $push: { members: { $each: [ann, bob], $position: 0 } } })).toEqual({
      kind: 'membersAdded',
      department: sales,
      employees: [ann, bob]
    })
  })

  it('treats a changed channel list as channelsChanged', () => {
    expect(update({ servoneDefaultChannels: [general] })).toEqual({ kind: 'channelsChanged', department: sales })
    expect(update({ servoneDefaultChannels: [] })).toEqual({ kind: 'channelsChanged', department: sales })
  })

  it('ignores removals and unrelated fields', () => {
    expect(update({ $pull: { members: ann } })).toBeUndefined()
    expect(update({ name: 'Sales team' })).toBeUndefined()
  })

  it('reads a created department only when it lists channels', () => {
    const base = { name: 'Sales', description: '', teamLead: null, members: [ann], managers: [] }
    const withChannels = factory.createTxCreateDoc<DepartmentWithChannels>(
      hr.class.Department,
      core.space.Workspace,
      { ...base, servoneDefaultChannels: [general] },
      sales
    )
    const withoutChannels = factory.createTxCreateDoc<DepartmentWithChannels>(
      hr.class.Department,
      core.space.Workspace,
      base,
      sales
    )
    expect(readDepartmentEvent(withChannels)).toEqual({ kind: 'channelsChanged', department: sales })
    expect(readDepartmentEvent(withoutChannels)).toBeUndefined()
  })

  it('ignores other classes, including the channel pushes this service makes', () => {
    const channelClass = 'chunter:class:Channel' as Ref<Class<Channel>>
    const channelPush = factory.createTxUpdateDoc(channelClass, core.space.Space, general, {
      $push: { members: 'acc' as AccountUuid }
    })
    expect(readDepartmentEvent(channelPush)).toBeUndefined()
  })
})

describe('readDepartmentEvent for projects', () => {
  const roadmap = 'roadmap' as Ref<Project>

  function updateProject (operations: DocumentUpdate<ProjectWithSync>): ReturnType<typeof readDepartmentEvent> {
    return readDepartmentEvent(
      factory.createTxUpdateDoc<ProjectWithSync>(tracker.class.Project, core.space.Space, roadmap, operations)
    )
  }

  it('reads a set sync department as projectSynced', () => {
    expect(updateProject({ servoneSyncDepartment: sales })).toEqual({
      kind: 'projectSynced',
      project: roadmap,
      department: sales
    })
  })

  it('ignores clearing the sync and unrelated project updates', () => {
    expect(updateProject({ servoneSyncDepartment: undefined })).toBeUndefined()
    expect(updateProject({ name: 'Roadmap 2' })).toBeUndefined()
    expect(updateProject({ $push: { members: 'acc' as AccountUuid } })).toBeUndefined()
  })

  it('reads a project created with a sync department', () => {
    const created = factory.createTxCreateDoc<ProjectWithSync>(
      tracker.class.Project,
      core.space.Space,
      {
        name: 'Roadmap',
        description: '',
        private: false,
        archived: false,
        members: [],
        identifier: 'RM',
        sequence: 0,
        defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
        type: 'classic' as Ref<ProjectType>,
        servoneSyncDepartment: sales
      },
      roadmap
    )
    expect(readDepartmentEvent(created)).toEqual({ kind: 'projectSynced', project: roadmap, department: sales })
  })
})

describe('planJoins', () => {
  const a1 = 'a1' as AccountUuid
  const a2 = 'a2' as AccountUuid
  const channel = (id: string, members: AccountUuid[], archived = false): SpaceMembers => ({
    _id: id as Ref<Channel>,
    members,
    archived
  })

  it('adds only accounts not yet in each channel', () => {
    const c1 = channel('c1', [a1])
    const c2 = channel('c2', [])
    expect(planJoins([a1, a2], [c1, c2])).toEqual([
      { space: c1, accounts: [a2] },
      { space: c2, accounts: [a1, a2] }
    ])
  })

  it('skips archived channels and channels that already have everyone', () => {
    expect(planJoins([a1], [channel('c1', [], true), channel('c2', [a1])])).toEqual([])
  })

  it('plans joins for synced projects, skipping archived ones and existing members', () => {
    const project = (id: string, members: AccountUuid[], archived = false): SpaceMembers => ({
      _id: id as Ref<Project>,
      members,
      archived
    })
    const roadmap = project('roadmap', [a1])
    expect(planJoins([a1, a2], [roadmap, project('old', [], true)])).toEqual([{ space: roadmap, accounts: [a2] }])
  })

  it('deduplicates accounts', () => {
    const c1 = channel('c1', [])
    expect(planJoins([a1, a1], [c1])).toEqual([{ space: c1, accounts: [a1] }])
  })
})
