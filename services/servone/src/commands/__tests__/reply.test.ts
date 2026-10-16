import { readAppReply } from '../reply'

describe('readAppReply', () => {
  it('posts a Slack in_channel answer with mrkdwn converted', () => {
    expect(readAppReply('{"response_type":"in_channel","text":"Deployed *api*"}')).toEqual({
      kind: 'message',
      visibility: 'in_channel',
      payload: { text: 'Deployed **api**', blocks: [] }
    })
  })

  it('keeps a Slack ephemeral answer private', () => {
    expect(readAppReply('{"response_type":"ephemeral","text":"hi"}')).toMatchObject({ kind: 'message', visibility: 'ephemeral' })
  })

  it('treats a missing response_type as ephemeral, like Slack', () => {
    expect(readAppReply('{"text":"hi"}')).toEqual({ kind: 'message', visibility: 'ephemeral', payload: { text: 'hi', blocks: [] } })
  })

  it('reads Slack blocks and attachments', () => {
    const reply = readAppReply(
      JSON.stringify({
        response_type: 'in_channel',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Build *12*' } }],
        attachments: [{ color: '#36a64f', text: 'green' }]
      })
    )
    expect(reply).toMatchObject({ kind: 'message', visibility: 'in_channel', payload: { color: '#36a64f' } })
  })

  it('reads a Servone native body with native blocks and color', () => {
    const body = {
      response_type: 'in_channel',
      text: 'Build 12',
      color: 'good',
      blocks: [{ type: 'fields', fields: [{ label: 'Env', value: 'staging' }] }]
    }
    expect(readAppReply(JSON.stringify(body))).toEqual({
      kind: 'message',
      visibility: 'in_channel',
      payload: { text: 'Build 12', color: 'good', blocks: [{ type: 'fields', fields: [{ label: 'Env', value: 'staging' }] }] }
    })
  })

  it('refuses a native body that breaks the native rules', () => {
    expect(readAppReply('{"text":"x","color":"pink"}')).toEqual({ kind: 'invalid' })
  })

  it('shows a plain-text answer privately', () => {
    expect(readAppReply('Queued build 12')).toEqual({
      kind: 'message',
      visibility: 'ephemeral',
      payload: { text: 'Queued build 12', blocks: [] }
    })
  })

  it('reads an empty or blank body as no answer', () => {
    expect(readAppReply('')).toEqual({ kind: 'none' })
    expect(readAppReply('  \n')).toEqual({ kind: 'none' })
    expect(readAppReply('{"response_type":"in_channel"}')).toEqual({ kind: 'none' })
  })

  it('treats bad JSON as invalid', () => {
    expect(readAppReply('{bad')).toEqual({ kind: 'invalid' })
  })

  it('treats a truncated JSON answer as invalid', () => {
    expect(readAppReply('{"response_type":"in_channel","text":"' + 'x'.repeat(100))).toEqual({ kind: 'invalid' })
  })
})
