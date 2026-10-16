import { type CommandRequest, formBody } from '../request'

const request: CommandRequest = {
  command: 'deploy',
  text: 'api staging',
  channelId: 'chunter:space:General',
  channelName: 'general',
  userId: 'acc-1',
  userName: 'Ana Lee',
  userEmail: 'ana@company.com',
  workspaceId: 'ws-1',
  responseUrl: 'https://svc.servone.vn/v1/chat/commands/respond/tok',
  triggerId: 'trig1'
}

describe('formBody', () => {
  it('sends every Slack field name with the command slash added', () => {
    const fields = new URLSearchParams(formBody(request))
    expect([...fields.entries()]).toEqual([
      ['command', '/deploy'],
      ['text', 'api staging'],
      ['channel_id', 'chunter:space:General'],
      ['channel_name', 'general'],
      ['user_id', 'acc-1'],
      ['user_name', 'Ana Lee'],
      ['user_email', 'ana@company.com'],
      ['workspace_id', 'ws-1'],
      ['response_url', 'https://svc.servone.vn/v1/chat/commands/respond/tok'],
      ['trigger_id', 'trig1']
    ])
  })

  it('encodes spaces as plus and unicode as UTF-8 percent escapes', () => {
    const body = formBody({ ...request, text: 'Đà Nẵng a&b=c+d' })
    expect(body).toContain('text=%C4%90%C3%A0+N%E1%BA%B5ng+a%26b%3Dc%2Bd')
  })

  it('sends an empty email when the runner has none', () => {
    expect(new URLSearchParams(formBody({ ...request, userEmail: undefined })).get('user_email')).toBe('')
  })
})
