import card from '@hcengineering/card'
import type { TxOperations } from '@hcengineering/core'
import type { ConfigClient } from '../client'
import { isValidKey, labelText, slugify, toLabel } from '../keys'
import { createWorkspace } from './harness'

describe('memory workspace', () => {
  it('loads the full model with the card system types', async () => {
    const ws = createWorkspace()
    const types = await ws.client.findAll(card.class.MasterTag, { _id: card.types.Document })
    expect(types).toHaveLength(1)
  })

  it('accepts a TxOperations as a ConfigClient', () => {
    const narrow = (ops: TxOperations): ConfigClient => ops
    expect(typeof narrow).toBe('function')
  })
})

describe('keys', () => {
  it('slugifies Vietnamese names', () => {
    expect(slugify('Đề nghị nghỉ phép')).toBe('de-nghi-nghi-phep')
    expect(slugify('  Hợp đồng & Khách hàng ')).toBe('hop-dong-khach-hang')
  })

  it('accepts lower-case ascii keys only', () => {
    expect(isValidKey('de-nghi.v2')).toBe(true)
    expect(isValidKey('Đề')).toBe(false)
    expect(isValidKey('')).toBe(false)
    expect(isValidKey('a'.repeat(81))).toBe(false)
  })

  it('reads embedded and plugin labels', () => {
    expect(labelText(toLabel(' Hợp đồng '))).toBe('Hợp đồng')
    expect(labelText(card.string.Card)).toBe('Card')
  })
})
