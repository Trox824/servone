import type { Class, CollaborativeDoc, Doc, Markup, MarkupBlobRef, Ref } from '@hcengineering/core'

import { COLLAB_TIMEOUT_MS, CollabTimeoutError, createCollabText } from '../collab'
import { WORKSPACE } from './fixtures'

const mockGetMarkup = jest.fn()
const mockCreateMarkup = jest.fn()
const mockUpdateMarkup = jest.fn()
const mockGetClient = jest.fn()
jest.mock('@hcengineering/collaborator-client', () => ({
  getClient: (...args: string[]) => {
    mockGetClient(...args)
    return { getMarkup: mockGetMarkup, createMarkup: mockCreateMarkup, updateMarkup: mockUpdateMarkup }
  }
}))

const doc: CollaborativeDoc = {
  objectClass: 'tracker:class:Issue' as Ref<Class<Doc>>,
  objectId: 'issue-1' as Ref<Doc>,
  objectAttr: 'description'
}
const source = 'blob-1' as MarkupBlobRef

describe('createCollabText', () => {
  beforeEach(() => {
    mockGetMarkup.mockReset()
    mockCreateMarkup.mockReset()
    mockUpdateMarkup.mockReset()
    mockGetClient.mockReset()
  })

  it('binds the collaborator client to the workspace and caller token', () => {
    createCollabText(WORKSPACE, 'tok', 'http://collab')
    expect(mockGetClient).toHaveBeenCalledWith(WORKSPACE, 'tok', 'http://collab')
  })

  it('round-trips markdown through collaborator markup', async () => {
    let stored: Markup = ''
    mockCreateMarkup.mockImplementation(async (_doc: CollaborativeDoc, markup: Markup) => {
      stored = markup
      return source
    })
    mockGetMarkup.mockImplementation(async () => stored)
    const collab = createCollabText(WORKSPACE, 'tok', 'http://collab')

    const ref = await collab.writeMarkdown(doc, '# Title\n\nbody')
    expect(ref).toBe(source)
    expect(mockCreateMarkup).toHaveBeenCalledWith(doc, expect.stringContaining('"heading"'))

    const markdown = await collab.readMarkdown(doc, source)
    expect(mockGetMarkup).toHaveBeenCalledWith(doc, source)
    expect(markdown.trim()).toBe('# Title\n\nbody')
  })

  it('returns empty text for a doc with no content yet without calling the collaborator', async () => {
    const collab = createCollabText(WORKSPACE, 'tok', 'http://collab')
    expect(await collab.readMarkdown(doc, null)).toBe('')
    expect(mockGetMarkup).not.toHaveBeenCalled()
  })

  it('updates markup converted from markdown', async () => {
    mockUpdateMarkup.mockResolvedValue(undefined)
    const collab = createCollabText(WORKSPACE, 'tok', 'http://collab')
    await collab.updateMarkdown(doc, '**bold**')
    expect(mockUpdateMarkup).toHaveBeenCalledWith(doc, expect.stringContaining('"bold"'))
  })

  it('gives up on a collaborator that never answers', async () => {
    jest.useFakeTimers()
    try {
      mockGetMarkup.mockReturnValue(new Promise(() => {}))
      const collab = createCollabText(WORKSPACE, 'tok', 'http://collab')
      const read = collab.readMarkdown(doc, source)
      jest.advanceTimersByTime(COLLAB_TIMEOUT_MS)
      await expect(read).rejects.toBeInstanceOf(CollabTimeoutError)
    } finally {
      jest.useRealTimers()
    }
  })
})
