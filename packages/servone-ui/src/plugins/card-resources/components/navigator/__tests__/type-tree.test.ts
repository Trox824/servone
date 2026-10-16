import { treeRoots } from '../type-tree'

describe('treeRoots', () => {
  it('keeps only types whose parent is not in the list', () => {
    const types = [
      { _id: 'engagement', extends: 'card' },
      { _id: 'fixed-price', extends: 'engagement' },
      { _id: 'project-file', extends: 'file' },
      { _id: 'design-asset', extends: 'project-file' }
    ]
    expect(treeRoots(types).map((it) => it._id)).toEqual(['engagement', 'project-file'])
  })

  it('lifts a child to the top when its parent is left out', () => {
    expect(treeRoots([{ _id: 'fixed-price', extends: 'engagement' }]).map((it) => it._id)).toEqual(['fixed-price'])
  })
})
