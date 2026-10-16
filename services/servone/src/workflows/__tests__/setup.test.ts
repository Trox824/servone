import core, { type Doc, type Tx, type TxApplyIf, type TxCreateDoc } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker from '@hcengineering/tracker'
import workbench from '@hcengineering/workbench'
import { ensureWorkflowSetup } from '../setup'

function recordingClient (existingApp: { _id: string, alias: string } | undefined): { client: Parameters<typeof ensureWorkflowSetup>[0], sent: Tx[] } {
  const sent: Tx[] = []
  const client = {
    findOne: async () => existingApp,
    findAll: async () => [],
    tx: async (tx: Tx) => {
      sent.push(tx)
      return {}
    }
  }
  return { client, sent }
}

function createsIn (sent: Tx[]): Array<TxCreateDoc<Doc>> {
  return sent
    .flatMap((tx) => (tx._class === core.class.TxApplyIf ? (tx as TxApplyIf).txes : [tx]))
    .filter((tx): tx is TxCreateDoc<Doc> => tx._class === core.class.TxCreateDoc)
}

describe('ensureWorkflowSetup', () => {
  it('writes the Workflow type, its task type, the department attribute and the app on an empty workspace', async () => {
    const { client, sent } = recordingClient(undefined)
    await ensureWorkflowSetup(client)
    const creates = createsIn(sent)
    const byClass = (cls: string): Array<TxCreateDoc<Doc>> => creates.filter((tx) => tx.objectClass === cls)

    const [type] = byClass(task.class.ProjectType)
    expect(type.objectId).toBe('servone:projectType:Workflow')
    expect(type.attributes).toMatchObject({ name: 'Quy trình', descriptor: tracker.descriptors.ProjectType, classic: true, tasks: ['servone:taskType:WorkflowItem'] })

    const [taskType] = byClass(task.class.TaskType)
    expect(taskType.objectId).toBe('servone:taskType:WorkflowItem')
    expect(taskType.attributes).toMatchObject({ name: 'Công việc', parent: 'servone:projectType:Workflow', ofClass: tracker.class.Issue })
    expect(Reflect.get(taskType.attributes, 'statusCategories')).toHaveLength(5)

    expect(byClass(tracker.class.IssueStatus).map((tx) => Reflect.get(tx.attributes, 'name'))).toEqual(['Mới', 'Đang làm', 'Hoàn thành', 'Đã hủy'])

    expect(byClass(core.class.Attribute).map((tx) => tx.attributes)).toContainEqual(
      expect.objectContaining({ attributeOf: tracker.class.Project, name: 'servoneDepartment', hidden: true })
    )

    const [app] = byClass(workbench.class.Application)
    expect(app.objectId).toBe('servone:app:Workflows')
    expect(app.attributes).toEqual({
      label: 'servone-workflow:string:Workflows',
      icon: 'servone-workflow:icon:workflow',
      alias: 'approval',
      hidden: false,
      position: 'top',
      navigatorModel: { spaces: [], specials: [] }
    })
  })

  it('writes nothing on a workspace that is already set up', async () => {
    const { client, sent } = recordingClient({ _id: 'servone:app:Workflows', alias: 'approval' })
    await ensureWorkflowSetup(client)
    expect(sent).toEqual([])
  })

  it('renames the app of a workspace set up under the old quy-trinh alias', async () => {
    const { client, sent } = recordingClient({ _id: 'servone:app:Workflows', alias: 'quy-trinh' })
    await ensureWorkflowSetup(client)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ _class: core.class.TxUpdateDoc, objectId: 'servone:app:Workflows', operations: { alias: 'approval' } })
  })
})
