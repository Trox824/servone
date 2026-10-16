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

import { ClassifierKind, type Class, type Doc, type PersonId, type Ref, type Space } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import { isArchivedType } from '../servone-archived'

function typeClass (): Class<Doc> {
  return {
    _id: 'servone:type:Leave' as Ref<Class<Doc>>,
    _class: 'card:class:MasterTag' as Ref<Class<Class<Doc>>>,
    space: 'core:space:Model' as Ref<Space>,
    modifiedOn: 0,
    modifiedBy: 'lan' as PersonId,
    kind: ClassifierKind.CLASS,
    label: 'Đề nghị nghỉ phép' as IntlString
  }
}

describe('isArchivedType', () => {
  it('reads the servoneArchived flag Studio writes', () => {
    expect(isArchivedType(typeClass())).toBe(false)
    expect(isArchivedType(Object.assign(typeClass(), { servoneArchived: true }))).toBe(true)
    expect(isArchivedType(Object.assign(typeClass(), { servoneArchived: false }))).toBe(false)
  })
})
