import { AccountRole, type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { createServer } from 'http'
import type { AddressInfo } from 'net'

import { authenticate } from '../../../webhooks/auth'
import { createStudioChat } from '../index'

jest.mock('../../../config', () => ({
  __esModule: true,
  default: {
    FrontUrl: 'https://front.servone.vn',
    mcp: { AnthropicApiKey: undefined, AiModel: 'claude-sonnet-5', CollaboratorUrl: 'http://collab', ServiceId: 'servone-mcp' }
  }
}))
jest.mock('../../../webhooks/auth', () => ({ authenticate: jest.fn() }))
jest.mock('../../session', () => ({ createSessionCache: jest.fn(() => jest.fn()), openSession: jest.fn() }))

describe('createStudioChat', () => {
  it('starts with the allow-listed tools', () => {
    expect(() => createStudioChat(jest.fn())).not.toThrow()
  })

  it('answers not_configured when no API key is set', async () => {
    jest.mocked(authenticate).mockResolvedValue({
      account: 'acc-admin' as AccountUuid,
      workspace: 'ws-1' as WorkspaceUuid,
      role: AccountRole.Maintainer
    })
    const route = createStudioChat(jest.fn())
    const server = createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname.split('/').filter((part) => part !== '')
      void route(req, res, path)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const response = await fetch(`${base}/studio/chat`, {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', text: 'Xin chào' }] })
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'not_configured' })
    expect(authenticate).toHaveBeenCalledWith('Bearer user-token', expect.any(Number))
    await new Promise<void>((resolve) => server.close(() => { resolve() }))
  })
})
