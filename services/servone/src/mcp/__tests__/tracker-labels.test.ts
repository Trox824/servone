import tags from '@hcengineering/tags'
import tracker from '@hcengineering/tracker'

import { issueRow, rowsOf, setup, TAG_BUG } from '../../tracker/__tests__/fixture'
import { ToolInputError, type AnyTool } from '../tool'
import { trackerTools } from '../tools/tracker'

const OCT_1_NOON = Date.UTC(2026, 9, 1, 12)

function tool (name: string): AnyTool {
  const found = trackerTools.find((t) => t.name === name)
  if (found === undefined) throw new Error(`no tool ${name}`)
  return found
}

describe('create_issue labels and due date', () => {
  it('passes labels and the due day through', async () => {
    const f = setup()
    const out = await tool('create_issue').run(f.session, { project: 'SRV', title: 'A', labels: ['bug'], dueDate: '2026-10-01' })
    expect(f.addCollection.mock.calls[0][5]).toMatchObject({ dueDate: OCT_1_NOON })
    expect(f.addCollection.mock.calls[1][0]).toBe(tags.class.TagReference)
    expect(f.addCollection.mock.calls[1][5].tag).toBe(TAG_BUG)
    expect(out).toBe('Created SRV-13: A')
  })

  it('reports a day that does not exist', async () => {
    const f = setup()
    await expect(tool('create_issue').run(f.session, { project: 'SRV', title: 'A', dueDate: '2026-02-30' })).rejects.toBeInstanceOf(
      ToolInputError
    )
  })
})

describe('update_issue labels and due date', () => {
  it('replaces labels and clears the due date', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12, { dueDate: OCT_1_NOON }))
    const out = await tool('update_issue').run(f.session, { id: 'SRV-12', labels: ['bug'], dueDate: null })
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ _id: 'i-12' }), { dueDate: null })
    expect(out).toBe('Updated SRV-12: labels Bug, due date cleared')
  })
})
