import * as servoneConfig from '@servone/config'
import { installInternalRequests } from '../pack'
import { memoryWorkspace } from '../../workflows/__tests__/memory-workspace'

jest.mock('@servone/config', () => ({
  findPack: jest.fn(() => ({ key: 'de-nghi-noi-bo', operations: [{ op: 'createType' }] })),
  describe: jest.fn(async () => ({})),
  packStatus: jest.fn(),
  plan: jest.fn(async () => ({ issues: [], ops: [{}] })),
  saveDraft: jest.fn(async () => ({ id: 'change-1' })),
  applyChange: jest.fn(async () => ({ kind: 'applied' }))
}))

const mocked = jest.mocked(servoneConfig)

describe('installInternalRequests', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('installs the pack into a workspace that has none of it', async () => {
    mocked.packStatus.mockReturnValue('notInstalled')
    expect(await installInternalRequests(memoryWorkspace().client)).toBe(true)
    expect(mocked.applyChange).toHaveBeenCalledWith(expect.objectContaining({ account: expect.objectContaining({ primarySocialId: 'core:account:System' }) }), 'change-1')
  })

  it.each(['installed', 'partial'] as const)('leaves a %s pack alone', async (state) => {
    mocked.packStatus.mockReturnValue(state)
    expect(await installInternalRequests(memoryWorkspace().client)).toBe(false)
    expect(mocked.saveDraft).not.toHaveBeenCalled()
  })

  it('fails when the change needs approval', async () => {
    mocked.packStatus.mockReturnValue('notInstalled')
    mocked.applyChange.mockResolvedValueOnce({ kind: 'pendingApproval' } as never)
    await expect(installInternalRequests(memoryWorkspace().client)).rejects.toThrow('was not applied: pendingApproval')
  })
})
