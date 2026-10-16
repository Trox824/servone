import { recordType, snapshotOf, link } from '../../__tests__/fixtures'
import { companyGraph } from '../model'
import { focusGraph } from '../search'

const graph = companyGraph(
  snapshotOf({
    types: [recordType('nghi-phep', 'Đề nghị nghỉ phép'), recordType('nhan-vien', 'Nhân viên'), recordType('hop-dong', 'Hợp đồng')],
    links: [link('gui', 'nghi-phep', 'nhan-vien')]
  }),
  new Set()
)

describe('focusGraph', () => {
  it('keeps a node, its neighbours and the edges between them', () => {
    const focused = focusGraph(graph, 'type:nhan-vien')
    expect(focused.nodes.map((it) => it.id)).toEqual(['type:nghi-phep', 'type:nhan-vien'])
    expect(focused.edges.map((it) => it.id)).toEqual(['link:gui'])
  })
})
