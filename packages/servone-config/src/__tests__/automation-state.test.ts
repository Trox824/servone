import core, { generateId } from '@hcengineering/core'
import process, { type Process, type State } from '@hcengineering/process'
import { makeRank } from '@hcengineering/rank'
import { withServone } from '../servone-fields'
import { loadState } from '../state'
import { addProcess, applyOps, createWorkspace, sessionFor, system, typeByKey } from './harness'

const CREATED_ON = 1000
const SYNCED_ON = 2000

describe('rules in the model state', () => {
  it('loads the processes of a type with their states and transitions', async () => {
    const ws = createWorkspace()
    await applyOps(sessionFor(ws), [{ op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' }])
    const type = await typeByKey(ws, 'nghi-phep')
    const rule = await addProcess(ws, type._id, 'Quy trình cũ')
    const first = generateId<State>()
    await ws.client.tx(
      system.createTxCreateDoc(process.class.State, core.space.Model, { process: rule, title: 'Mới', rank: makeRank(undefined, undefined) }, first)
    )
    await ws.client.tx(
      system.createTxCreateDoc(process.class.Transition, core.space.Model, {
        process: rule,
        from: null,
        to: first,
        trigger: process.trigger.OnExecutionStart,
        triggerParams: {},
        actions: [],
        rank: makeRank(undefined, undefined)
      })
    )

    const state = await loadState(ws.client)
    expect(state.processesOf(type._id).map((it) => it._id)).toEqual([rule])
    expect(state.resolveRule(type._id, rule)?._id).toBe(rule)
    expect(state.statesOf(rule).map((it) => it.title)).toEqual(['Mới'])
    expect(state.transitionsOf(rule).map((it) => it.to)).toEqual([first])
  })

  it('ignores the process context the server rewrites', async () => {
    const ws = createWorkspace()
    await applyOps(sessionFor(ws), [{ op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' }])
    const type = await typeByKey(ws, 'nghi-phep')
    const rule = generateId<Process>()
    const base = withServone(
      { masterTag: type._id, name: 'Nộp đơn', description: '', context: {}, autoStart: true },
      { servoneKey: 'nop-don', servoneRule: '{"name":"A"}' }
    )
    await ws.client.tx(system.createTxCreateDoc(process.class.Process, core.space.Model, base, rule, CREATED_ON))
    const before = (await loadState(ws.client)).version()

    await ws.client.tx(
      system.createTxUpdateDoc(process.class.Process, core.space.Model, rule, { context: {} }, false, SYNCED_ON)
    )
    expect((await loadState(ws.client)).version()).toBe(before)

    await ws.client.tx(
      system.createTxUpdateDoc(process.class.Process, core.space.Model, rule, withServone({}, { servoneRule: '{"name":"B"}' }))
    )
    expect((await loadState(ws.client)).version()).not.toBe(before)
  })
})
