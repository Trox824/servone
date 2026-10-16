//
// Copyright © 2025 Hardcore Engineering Inc.
//

import type { Class, Doc, Ref } from '@hcengineering/core'

import { createRestClient } from '../rest'

const STATUS_CLASS = 'tracker:class:IssueStatus' as Ref<Class<Doc>>

function respondWith (body: string): void {
  global.fetch = jest.fn().mockResolvedValue(new Response(body, { status: 200 }))
}

describe('RestClient.findAll', () => {
  it('keeps embedded $lookup objects when the server sends lookupMap: null', async () => {
    respondWith(
      JSON.stringify({
        dataType: 'TotalArray',
        total: 1,
        lookupMap: null,
        value: [{ _id: 'status-1', _class: STATUS_CLASS, $lookup: { category: { _id: 'cat-1', name: 'Done' } } }]
      })
    )

    const docs = await createRestClient('http://transactor', 'ws-1', 'token').findAll(STATUS_CLASS, {})

    expect(docs).toHaveLength(1)
    expect(docs[0].$lookup).toEqual({ category: { _id: 'cat-1', name: 'Done' } })
  })

  it('resolves $lookup ids through lookupMap when the server sends one', async () => {
    respondWith(
      JSON.stringify({
        dataType: 'TotalArray',
        total: 1,
        lookupMap: { 'cat-1': { _id: 'cat-1', name: 'Done' } },
        value: [{ _id: 'status-1', _class: STATUS_CLASS, $lookup: { category: 'cat-1' } }]
      })
    )

    const docs = await createRestClient('http://transactor', 'ws-1', 'token').findAll(STATUS_CLASS, {})

    expect(docs[0].$lookup).toEqual({ category: { _id: 'cat-1', name: 'Done' } })
  })
})
