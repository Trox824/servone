import type { Class, Doc, PersonId, Ref, Space } from '@hcengineering/core'
import { arrangeApps, hiddenAppRedirect, moveApp, parseAppOrder } from '../app-rail'

const tracker = { _id: 'tracker', order: 2 }
const chat = { _id: 'chat', order: 1 }
const drive = { _id: 'drive' }
const mail = { _id: 'mail', order: 3 }

describe('arrangeApps', () => {
  it('uses the model order when nothing is saved', () => {
    expect(arrangeApps([drive, tracker, chat], [], new Set())).toEqual([chat, tracker, drive])
  })

  it('puts top apps before the rest when nothing is saved', () => {
    const calendar = { _id: 'calendar', order: 9, position: 'top' as const }
    expect(arrangeApps([chat, calendar], [], new Set())).toEqual([calendar, chat])
  })

  it('follows the saved order', () => {
    expect(arrangeApps([chat, tracker, drive], ['drive', 'chat', 'tracker'], new Set())).toEqual([
      drive,
      chat,
      tracker
    ])
  })

  it('appends apps missing from the saved order in model order', () => {
    expect(arrangeApps([chat, tracker, mail, drive], ['tracker'], new Set())).toEqual([tracker, chat, mail, drive])
  })

  it('drops saved ids of apps that no longer exist', () => {
    expect(arrangeApps([chat, tracker], ['gone', 'tracker', 'chat'], new Set())).toEqual([tracker, chat])
  })

  it('keeps workspace-disabled apps out even when saved', () => {
    expect(arrangeApps([chat, tracker, drive], ['drive', 'tracker', 'chat'], new Set(['tracker']))).toEqual([
      drive,
      chat
    ])
  })
})

describe('moveApp', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('moves down into the target slot', () => {
    expect(moveApp(ids, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves up into the target slot', () => {
    expect(moveApp(ids, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('swaps neighbours', () => {
    expect(moveApp(ids, 'b', 'c')).toEqual(['a', 'c', 'b', 'd'])
    expect(moveApp(ids, 'c', 'b')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('leaves the order alone for unknown ids or a drop on itself', () => {
    expect(moveApp(ids, 'x', 'b')).toEqual(ids)
    expect(moveApp(ids, 'b', 'x')).toEqual(ids)
    expect(moveApp(ids, 'b', 'b')).toEqual(ids)
  })
})

describe('parseAppOrder', () => {
  const pref = (extra: { servoneAppOrder?: string | Array<string | number> }): Doc => ({
    _id: 'pref' as Ref<Doc>,
    _class: 'preference:class:Preference' as Ref<Class<Doc>>,
    space: 'core:space:Workspace' as Ref<Space>,
    modifiedOn: 0,
    modifiedBy: 'me' as PersonId,
    ...extra
  })

  it('reads a string list', () => {
    expect(parseAppOrder(pref({ servoneAppOrder: ['a', 'b'] }))).toEqual(['a', 'b'])
  })

  it('treats a missing or malformed list as empty', () => {
    expect(parseAppOrder(pref({}))).toEqual([])
    expect(parseAppOrder(pref({ servoneAppOrder: 'a' }))).toEqual([])
    expect(parseAppOrder(pref({ servoneAppOrder: ['a', 3] }))).toEqual(['a'])
  })
})

describe('hiddenAppRedirect', () => {
  it('sends a hidden app to the home app and keeps an open panel', () => {
    expect(hiddenAppRedirect({ path: ['workbench', 'ws', 'recruit', 'talents'], fragment: 'panel' }, 'tracker')).toEqual({
      path: ['workbench', 'ws', 'tracker'],
      fragment: 'panel'
    })
  })

  it('leaves shipped apps alone', () => {
    expect(hiddenAppRedirect({ path: ['workbench', 'ws', 'tracker'] }, 'tracker')).toBeUndefined()
  })

  it('lets a card short link resolve so mail and workflow links keep working', () => {
    expect(hiddenAppRedirect({ path: ['workbench', 'ws', 'card', 'card-id'] }, 'tracker')).toBeUndefined()
    expect(hiddenAppRedirect({ path: ['workbench', 'ws', 'card', 'browser'] }, 'tracker')?.path[2]).toBe('tracker')
  })
})
