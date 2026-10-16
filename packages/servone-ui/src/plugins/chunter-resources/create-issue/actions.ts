import type { ChatMessage } from '@hcengineering/chunter'
import type { Hierarchy } from '@hcengineering/core'
import tracker from '@hcengineering/tracker'
import type { Action } from '@hcengineering/ui'

import { canCreateIssueFrom } from './create'
import { openCreateIssue } from './open'
import { createIssueUi } from './strings'

export function createIssueActions (message: ChatMessage, hierarchy: Hierarchy, isReadonly: boolean): Action[] {
  if (isReadonly || !canCreateIssueFrom(hierarchy, message)) return []
  return [
    {
      label: createIssueUi.CreateIssue,
      icon: tracker.icon.Issue,
      group: 'copy',
      action: async () => {
        await openCreateIssue(message)
      }
    }
  ]
}
