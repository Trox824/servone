import { changeRows, lastUndoable } from '../history'
import { change, personId } from './fixtures'

const lanPrimary = personId('lan-email')
const lanOther = personId('lan-google')
const minh = personId('minh')
const pendingByLan = change('p1', { status: 'pending', risk: 'sensitive', author: lanOther, createdOn: 2 })
const applied = change('a1', { status: 'applied', createdOn: 3 })
const draft = change('d1', { status: 'draft', createdOn: 1 })
const rejected = change('r1', { status: 'rejected', createdOn: 0 })

describe('changeRows', () => {
  it('sorts newest first and labels status', () => {
    const rows = changeRows([draft, applied, rejected, pendingByLan], { socialIds: [minh], isMaintainer: true })
    expect(rows.map((it) => [it.change.id, it.statusLabel])).toEqual([
      ['a1', 'Đã áp dụng'],
      ['p1', 'Chờ duyệt'],
      ['d1', 'Bản nháp'],
      ['r1', 'Đã từ chối']
    ])
  })

  it('hides approve from the author of a pending change', () => {
    const [own] = changeRows([pendingByLan], { socialIds: [lanPrimary, lanOther], isMaintainer: true })
    expect(own).toMatchObject({ isOwn: true, isOwnPending: true, canApprove: false, canReject: true, rejectLabel: 'Rút lại' })
    const [other] = changeRows([pendingByLan], { socialIds: [minh], isMaintainer: true })
    expect(other).toMatchObject({ isOwn: false, canApprove: true, canReject: true, rejectLabel: 'Từ chối' })
  })

  it('gives a non-Maintainer no actions', () => {
    const rows = changeRows([pendingByLan, applied, draft], { socialIds: [minh], isMaintainer: false })
    for (const row of rows) {
      expect([row.canApprove, row.canReject, row.canUndo, row.canDiscard]).toEqual([false, false, false, false])
    }
  })

  it('offers undo on applied changes and discard on drafts only', () => {
    const rows = changeRows([applied, draft, rejected], { socialIds: [minh], isMaintainer: true })
    expect(rows.map((it) => [it.change.id, it.canUndo, it.canDiscard])).toEqual([
      ['a1', true, false],
      ['d1', false, true],
      ['r1', false, false]
    ])
  })
})

describe('lastUndoable', () => {
  const inverse = [{ op: 'archiveType' as const, type: 'leave' }]
  const older = change('o1', { status: 'applied', inverse, createdOn: 1 })
  const newer = change('n1', { status: 'applied', inverse, createdOn: 2 })

  it('picks the newest applied change', () => {
    expect(lastUndoable([older, newer, pendingByLan])?.id).toBe('n1')
  })

  it('skips an undo record so a second click steps further back instead of redoing', () => {
    const undoOfNewer = change('u1', { status: 'applied', inverse, undoOf: newer.id, createdOn: 3 })
    const undone = { ...newer, status: 'undone' as const }
    expect(lastUndoable([older, undone, undoOfNewer])?.id).toBe('o1')
  })

  it('skips a change with nothing to invert', () => {
    expect(lastUndoable([applied])).toBeUndefined()
  })
})
