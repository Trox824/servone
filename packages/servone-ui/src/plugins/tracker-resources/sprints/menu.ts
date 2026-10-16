import { getClient } from '@hcengineering/presentation'
import tags from '@hcengineering/tags'
import type { Issue } from '@hcengineering/tracker'
import { getEventPositionElement, SelectPopup, showPopup, type PopupAlignment } from '@hcengineering/ui'
import { showMenu } from '@hcengineering/view-resources'
import { pickBlockers } from './blocked'
import { icon, str } from './plugin'
import { RELEASE_CATEGORY, toggleIssueRelease, toRelease } from './releases'
import { RELEASE } from './scrum-spec'

export async function pickFixVersion (issue: Issue, anchor: PopupAlignment | undefined): Promise<void> {
  const client = getClient()
  const all = (await client.findAll(tags.class.TagElement, { category: RELEASE_CATEGORY, [RELEASE.project]: issue.space } as any))
    .filter((t) => toRelease(t).state !== 'archived')
  const mine = new Set((await client.findAll(tags.class.TagReference, { attachedTo: issue._id })).map((r) => r.tag as string))
  const value = all.map((t) => ({ id: t._id, text: t.title, icon: icon.release, isSelected: mine.has(t._id) }))
  showPopup(SelectPopup, { value, searchable: true, placeholder: str.FixVersionSearch }, anchor, async (id?: string) => {
    const release = all.find((t) => t._id === id)
    if (release !== undefined) await toggleIssueRelease(client, issue, release)
  })
}

export function issueMenu (e: MouseEvent, issue: Issue): void {
  const anchor = getEventPositionElement(e)
  showMenu(e, {
    object: issue,
    actions: [
      {
        label: str.BlockedByAction,
        group: 'edit',
        action: async () => {
          await pickBlockers(getClient(), issue, anchor)
        }
      },
      {
        label: str.FixVersionAction,
        group: 'edit',
        action: async () => {
          await pickFixVersion(issue, anchor)
        }
      }
    ]
  })
}
