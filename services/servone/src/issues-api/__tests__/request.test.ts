import { MAX_LABELS, parseCommentBody, parseCreateBody, parseIdempotencyKey, parsePatchBody } from '../request'

const OCT_1_NOON = Date.UTC(2026, 9, 1, 12)

describe('parseCreateBody', () => {
  it('reads every field', () => {
    const body = JSON.stringify({
      project: 'SRV',
      title: ' Login fails ',
      description: '# Steps',
      priority: 'high',
      assignee: 'an@servone.vn',
      labels: ['bug'],
      dueDate: '2026-10-01'
    })
    expect(parseCreateBody(body)).toEqual({
      isValid: true,
      draft: {
        project: 'SRV',
        title: 'Login fails',
        description: '# Steps',
        priority: 'high',
        assignee: 'an@servone.vn',
        labels: ['bug'],
        dueDate: OCT_1_NOON
      }
    })
  })

  it.each([
    ['not json', '{', 'invalid_json', undefined],
    ['an array', '[]', 'invalid', 'body'],
    ['missing title', '{"project":"SRV"}', 'invalid', 'title'],
    ['blank title', '{"project":"SRV","title":"  "}', 'invalid', 'title'],
    ['long title', JSON.stringify({ project: 'SRV', title: 'x'.repeat(256) }), 'invalid', 'title'],
    ['unknown key', '{"project":"SRV","title":"A","asignee":"x@y.z"}', 'invalid', 'asignee'],
    ['bad priority', '{"project":"SRV","title":"A","priority":"p1"}', 'invalid', 'priority'],
    ['assignee name', '{"project":"SRV","title":"A","assignee":"An Tran"}', 'invalid', 'assignee'],
    ['null assignee', '{"project":"SRV","title":"A","assignee":null}', 'invalid', 'assignee'],
    ['label not a string', '{"project":"SRV","title":"A","labels":["bug",3]}', 'invalid', 'labels.1'],
    ['too many labels', JSON.stringify({ project: 'SRV', title: 'A', labels: Array.from({ length: MAX_LABELS + 1 }, (_, i) => `l${i}`) }), 'invalid', 'labels'],
    ['impossible day', '{"project":"SRV","title":"A","dueDate":"2026-02-30"}', 'invalid', 'dueDate'],
    ['timestamp as day', '{"project":"SRV","title":"A","dueDate":1790000000000}', 'invalid', 'dueDate']
  ])('rejects %s', (_name, body, error, field) => {
    const parsed = parseCreateBody(body)
    expect(parsed.isValid).toBe(false)
    expect(parsed).toMatchObject(field === undefined ? { error } : { error, field })
  })
})

describe('parsePatchBody', () => {
  it('allows null to clear assignee and due date', () => {
    expect(parsePatchBody('{"assignee":null,"dueDate":null,"status":"In Progress","labels":[]}')).toEqual({
      isValid: true,
      patch: { assignee: null, dueDate: null, status: 'In Progress', labels: [] }
    })
  })

  it.each([
    ['empty object', '{}', 'body'],
    ['project', '{"project":"OPS"}', 'project'],
    ['blank status', '{"status":" "}', 'status']
  ])('rejects %s', (_name, body, field) => {
    expect(parsePatchBody(body)).toMatchObject({ isValid: false, error: 'invalid', field })
  })
})

describe('parseCommentBody', () => {
  it('trims the text', () => {
    expect(parseCommentBody('{"text":" Deployed "}')).toEqual({ isValid: true, text: 'Deployed' })
  })

  it.each(['{}', '{"text":"  "}', '{"text":"a","extra":1}'])('rejects %s', (body) => {
    expect(parseCommentBody(body)).toMatchObject({ isValid: false, error: 'invalid' })
  })
})

describe('parseIdempotencyKey', () => {
  it('accepts a missing header', () => {
    expect(parseIdempotencyKey(undefined)).toEqual({ isValid: true, key: undefined })
  })

  it('accepts visible ASCII', () => {
    expect(parseIdempotencyKey('zap-123_ABC:9')).toEqual({ isValid: true, key: 'zap-123_ABC:9' })
  })

  it.each([['empty', ''], ['space', 'a b'], ['too long', 'k'.repeat(256)], ['non ascii', 'khóa'], ['repeated', ['a', 'b']]])(
    'rejects %s',
    (_name, header) => {
      expect(parseIdempotencyKey(header)).toMatchObject({ isValid: false, error: 'invalid', field: 'Idempotency-Key' })
    }
  )
})
