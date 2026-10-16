import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alertEmail, changedResults } from './watch.mjs'

test('alerts only when a check changes state, including recovery', () => {
  const lastProblems = new Map([['front health', 'unreachable'], ['account deploy', undefined]])
  const results = [
    { key: 'front health', problem: undefined, detail: 'ok' },
    { key: 'account deploy', problem: undefined, detail: 'ok' },
    { key: 'transactor deploy', problem: 'CRASHED d1', detail: 'crashed' }
  ]
  const changes = changedResults(lastProblems, results)
  assert.deepEqual(changes.map((change) => change.key), ['front health', 'transactor deploy'])
  assert.equal(changedResults(new Map(results.map((result) => [result.key, result.problem])), results).length, 0)
  assert.equal(alertEmail(changes).subject, '[Servone] transactor deploy: CRASHED d1, 1 recovered')
})
