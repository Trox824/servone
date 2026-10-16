//
// Copyright © 2026 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { type PersonId } from '@hcengineering/core'
import { sharedEventUpdate } from './index'

const DAY_MS = 24 * 60 * 60 * 1000

describe('sharedEventUpdate', () => {
  it('keeps shared fields and drops the organizer reminders', () => {
    expect(sharedEventUpdate({ title: 'Standup', date: 1000, reminders: [DAY_MS] })).toEqual({ title: 'Standup', date: 1000 })
  })

  it('drops per-copy fields', () => {
    expect(sharedEventUpdate({ reminders: [], visibility: 'private', user: 'u1' as PersonId })).toEqual({})
  })
})
