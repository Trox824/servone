import {
  AssistantError,
  type AssistantReply,
  canApply,
  canSend,
  draftStateOf,
  draftStateText,
  errorCodeFor,
  errorText,
  initialAssistant,
  MAX_HISTORY_TURNS,
  MAX_TEXT_CHARS,
  parseAssistantReply,
  requestFor,
  withDraftState,
  withFailure,
  withQuestion,
  withReply
} from '../assistant'
import { change, changeId } from './fixtures'

const REPLY_JSON = {
  reply: 'Tôi đã lập kế hoạch. Anh bấm "Áp dụng" dưới kế hoạch.',
  stop: 'done',
  drafts: [
    {
      id: 'change-1',
      summary: 'Xóa trường Ghi chú',
      risk: 'destructive',
      diff: [
        { text: 'Xóa trường Ghi chú', risk: 'destructive', affected: 42 },
        { text: 'Đổi tên trường Lý do', risk: 'safe', affected: null }
      ]
    }
  ]
}

function replied (): AssistantReply {
  return parseAssistantReply(REPLY_JSON)
}

describe('parseAssistantReply', () => {
  it('reads the reply, the stop reason and the drafts', () => {
    expect(replied()).toEqual({
      reply: REPLY_JSON.reply,
      stop: 'done',
      drafts: [
        {
          id: changeId('change-1'),
          summary: 'Xóa trường Ghi chú',
          risk: 'destructive',
          diff: [
            { text: 'Xóa trường Ghi chú', risk: 'destructive', affected: 42 },
            { text: 'Đổi tên trường Lý do', risk: 'safe' }
          ]
        }
      ]
    })
  })

  it.each([
    ['an unknown stop', { ...REPLY_JSON, stop: 'maybe' }],
    ['an unknown risk', { ...REPLY_JSON, drafts: [{ ...REPLY_JSON.drafts[0], risk: 'huge' }] }],
    ['a missing reply', { stop: 'done', drafts: [] }],
    ['a non-object', ['done']]
  ])('refuses %s', (_, json) => {
    expect(() => parseAssistantReply(json)).toThrow(AssistantError)
  })
})

describe('errorCodeFor', () => {
  it('maps service answers to what the panel says', () => {
    expect(errorCodeFor(401, { error: 'unauthorized' })).toBe('unauthorized')
    expect(errorCodeFor(403, { error: 'forbidden' })).toBe('forbidden')
    expect(errorCodeFor(429, { error: 'rate_limited' })).toBe('rate_limited')
    expect(errorCodeFor(502, { error: 'model_unavailable' })).toBe('model_unavailable')
    expect(errorCodeFor(503, { error: 'not_configured' })).toBe('not_configured')
    expect(errorCodeFor(400, { error: 'too_large' })).toBe('invalid_request')
    expect(errorCodeFor(500, null)).toBe('failed')
    expect(errorText('not_configured')).toBe('Trợ lý AI chưa được bật trên máy chủ này.')
  })
})

describe('conversation', () => {
  it('sends only a non-empty question that fits, one at a time', () => {
    const start = initialAssistant()
    expect(canSend(start, '   ')).toBe(false)
    expect(canSend(start, 'a'.repeat(MAX_TEXT_CHARS + 1))).toBe(false)
    expect(canSend(start, 'Thêm trường Nơi đến')).toBe(true)
    const sending = withQuestion(start, '  Thêm trường Nơi đến ')
    expect(sending.isSending).toBe(true)
    expect(sending.entries).toEqual([{ id: 0, role: 'user', text: 'Thêm trường Nơi đến', note: undefined, drafts: [] }])
    expect(canSend(sending, 'Câu nữa')).toBe(false)
  })

  it('adds the reply with its drafts ready to apply', () => {
    const state = withReply(withQuestion(initialAssistant(), 'Xóa trường Ghi chú'), replied())
    expect(state.isSending).toBe(false)
    expect(state.entries[1].drafts.map((it) => it.state)).toEqual(['ready'])
    expect(state.entries[1].note).toBeUndefined()
  })

  it('explains a reply cut by the turn limit', () => {
    const state = withReply(withQuestion(initialAssistant(), 'Làm lại mọi thứ'), { reply: '', stop: 'turn_limit', drafts: [] })
    expect(state.entries[1].note).toBe('Trợ lý dừng vì yêu cầu cần quá nhiều bước. Hãy chia nhỏ yêu cầu.')
  })

  it('keeps the question and shows the error after a failure', () => {
    const state = withFailure(withQuestion(initialAssistant(), 'Xin chào'), 'rate_limited')
    expect(state.isSending).toBe(false)
    expect(state.entries).toHaveLength(1)
    expect(state.error).toBe('Trợ lý đang bận. Thử lại sau ít phút.')
  })

  it('keeps a plan applied while the next question is in flight', () => {
    const first = withReply(withQuestion(initialAssistant(), 'Xóa trường Ghi chú'), replied())
    const sending = withQuestion(first, 'Thêm trường Nơi đến')
    const applied = withDraftState(sending, changeId('change-1'), 'applied')
    const state = withReply(applied, { reply: 'Xong.', stop: 'done', drafts: [] })
    expect(state.entries[1].drafts[0].state).toBe('applied')
    expect(state.entries).toHaveLength(4)
  })
})

describe('applying drafts', () => {
  it('applies a draft only from the ready state', () => {
    const ready = withReply(withQuestion(initialAssistant(), 'Xóa trường Ghi chú'), replied())
    const applying = withDraftState(ready, changeId('change-1'), 'applying')
    expect(canApply(ready.entries[1].drafts[0].state)).toBe(true)
    expect(canApply(applying.entries[1].drafts[0].state)).toBe(false)
    expect(withDraftState(ready, changeId('other'), 'applied').entries[1].drafts[0].state).toBe('ready')
  })

  it('names every save outcome', () => {
    expect(draftStateOf({ kind: 'applied', changes: [change('change-1', { status: 'applied' })] })).toBe('applied')
    expect(draftStateOf({ kind: 'pending', change: change('change-1', { status: 'pending' }) })).toBe('pending')
    expect(draftStateOf({ kind: 'cancelled' })).toBe('ready')
    expect(draftStateOf({ kind: 'stale' })).toBe('stale')
    expect(draftStateOf({ kind: 'unchanged' })).toBe('unchanged')
    expect(draftStateOf({ kind: 'invalid', issues: [] })).toBe('failed')
    expect(draftStateOf({ kind: 'failed' })).toBe('failed')
    expect(draftStateOf({ kind: 'partial', changes: [change('change-1', { status: 'applied' })], stopped: { kind: 'stale' } })).toBe('stale')
    expect(draftStateText('stale')).toBe('Cấu hình vừa đổi. Hãy nhờ trợ lý lập lại kế hoạch.')
  })
})

describe('requestFor', () => {
  it('sends text turns with what happened to each plan', () => {
    let state = withReply(withQuestion(initialAssistant(), 'Xóa trường Ghi chú'), replied())
    state = withDraftState(state, changeId('change-1'), 'applied')
    expect(requestFor(state, 'nghi-phep')).toEqual({
      messages: [
        { role: 'user', text: 'Xóa trường Ghi chú' },
        { role: 'assistant', text: `Kế hoạch "Xóa trường Ghi chú": Đã áp dụng\n${REPLY_JSON.reply}` }
      ],
      typeKey: 'nghi-phep'
    })
    expect('typeKey' in requestFor(state, undefined)).toBe(false)
  })

  it('keeps the last turns, starting from a user turn', () => {
    let state = initialAssistant()
    for (let i = 0; i < MAX_HISTORY_TURNS; i++) {
      state = withReply(withQuestion(state, `Câu ${i}`), { reply: `Trả lời ${i}`, stop: 'done', drafts: [] })
    }
    state = withQuestion(state, 'Câu cuối')
    const { messages } = requestFor(state, undefined)
    expect(messages.length).toBeLessThanOrEqual(MAX_HISTORY_TURNS)
    expect(messages[0].role).toBe('user')
    expect(messages[messages.length - 1]).toEqual({ role: 'user', text: 'Câu cuối' })
  })

  it('cuts long assistant turns to the service limit', () => {
    const state = withQuestion(
      withReply(withQuestion(initialAssistant(), 'Giải thích'), { reply: 'a'.repeat(MAX_TEXT_CHARS * 2), stop: 'done', drafts: [] }),
      'Tiếp'
    )
    expect(requestFor(state, undefined).messages[1].text).toHaveLength(MAX_TEXT_CHARS)
  })
})
