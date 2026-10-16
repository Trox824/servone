import { isPaletteAction, matchesQuery } from '../palette'

describe('isPaletteAction', () => {
  it('drops upstream navigation and the replaced actions', () => {
    expect(isPaletteAction({ _id: 'x', category: 'view:category:Navigation' })).toBe(false)
    expect(isPaletteAction({ _id: 'notification:action:ReadAll', category: 'notification:category:Notification' })).toBe(false)
    expect(isPaletteAction({ _id: 'workbench:action:CloseCurrentTab', category: 'workbench:category:Workbench' })).toBe(false)
  })

  it('drops the server debug panel, whose action id is generated', () => {
    expect(
      isPaletteAction({ _id: 'random', category: 'view:category:General', actionProps: { component: 'workbench:component:ServerManager' } })
    ).toBe(false)
  })

  it('keeps the rest', () => {
    expect(isPaletteAction({ _id: 'tracker:action:NewIssueGlobal', category: 'tracker:category:Tracker' })).toBe(true)
  })
})

describe('matchesQuery', () => {
  it('ignores Vietnamese accents and case', () => {
    expect(matchesQuery('lich', ['Lịch'])).toBe(true)
    expect(matchesQuery('DON', ['Đơn từ'])).toBe(true)
  })

  it('matches any of the texts and treats blank as a match', () => {
    expect(matchesQuery('work', ['Your work', 'Tracker'])).toBe(true)
    expect(matchesQuery('  ', ['Chat'])).toBe(true)
    expect(matchesQuery('mail', ['Chat'])).toBe(false)
  })

  it('needs every word, in any of the texts', () => {
    expect(matchesQuery('servone sprint', ['Sprint', 'Servone'])).toBe(true)
    expect(matchesQuery('sprint planning', ['Planning', 'Servone · Sprint'])).toBe(true)
    expect(matchesQuery('servone mail', ['Sprint', 'Servone'])).toBe(false)
  })
})
