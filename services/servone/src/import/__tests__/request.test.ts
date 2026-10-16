import { parseImportRequest } from '../request'

const issue = {
  key: 'LIN-1',
  title: 'Fix login',
  description: '',
  status: 'inProgress',
  sourceStatus: 'In Progress',
  priority: 'high',
  labels: ['bug'],
  comments: [{ text: 'On it', date: 1700000000000, author: { email: 'a@b.co' } }]
}

describe('parseImportRequest', () => {
  it.each([
    { op: 'match', people: [{ name: 'Ann' }, { email: 'a@b.co' }, {}] },
    { op: 'project', name: 'Mobile' },
    { op: 'issues', project: 'p-1', issues: [issue, { ...issue, key: 'LIN-2', parent: 'LIN-1' }] },
    { op: 'channel', channel: { name: 'general', topic: '', isPrivate: false, isArchived: true, members: [{ email: 'a@b.co' }] } },
    { op: 'messages', channel: 'c-1', messages: [{ key: '1', date: 1, text: 'hi' }, { key: '2', thread: '1', date: 2, text: 'yo' }] },
    { op: 'teamspace', name: 'Wiki' },
    { op: 'docs', teamspace: 't-1', docs: [{ key: 'a', title: 'Home', markdown: '# Home' }, { key: 'b', title: 'Sub', markdown: '', parent: 'a' }] }
  ])('accepts $op', (body) => {
    expect(parseImportRequest(JSON.stringify(body))).toEqual({ request: body })
  })

  it('trims the project name', () => {
    expect(parseImportRequest(JSON.stringify({ op: 'project', name: '  Mobile ' }))).toEqual({ request: { op: 'project', name: 'Mobile' } })
  })

  it('refuses text that is not JSON', () => {
    expect(parseImportRequest('{op:')).toEqual({ error: 'invalid_json' })
  })

  it('refuses an unknown op', () => {
    expect(parseImportRequest(JSON.stringify({ op: 'drop' }))).toEqual({ error: 'invalid', field: 'op' })
  })

  it('names the bad field', () => {
    const body = { op: 'issues', project: 'p-1', issues: [{ ...issue, status: 'started' }] }
    expect(parseImportRequest(JSON.stringify(body))).toEqual({ error: 'invalid', field: 'issues.0.status' })
  })

  it('refuses a blank channel name', () => {
    const body = { op: 'channel', channel: { name: ' ', topic: '', isPrivate: false, isArchived: false, members: [] } }
    expect(parseImportRequest(JSON.stringify(body))).toEqual({ error: 'invalid', field: 'channel.name' })
  })

  it('drops fields outside the contract', () => {
    expect(parseImportRequest(JSON.stringify({ op: 'teamspace', name: 'Wiki', extra: 1 }))).toEqual({ request: { op: 'teamspace', name: 'Wiki' } })
  })
})
