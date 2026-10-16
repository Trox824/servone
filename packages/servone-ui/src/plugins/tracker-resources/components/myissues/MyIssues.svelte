<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import core, { getCurrentAccount, type DocumentQuery, type Ref } from '@hcengineering/core'
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { Issue, IssueStatus } from '@hcengineering/tracker'
  import { resolvedLocationStore, type IModeSelector } from '@hcengineering/ui'
  import task from '@hcengineering/task'
  import { createEventDispatcher } from 'svelte'
  import tracker from '../../plugin'
  import IssuesView from '../issues/IssuesView.svelte'

  export let config: [string, IntlString, object][] = []
  export let icon: Asset | undefined = undefined

  const SUPPORTED_TABS = ['assigned', 'created', 'subscribed'] as const
  type SupportedTab = (typeof SUPPORTED_TABS)[number]

  const dispatch = createEventDispatcher()
  const client = getClient()
  const account = getCurrentAccount()
  const currentEmployee = getCurrentEmployee()

  function toSupportedTab (candidate: string | null | undefined): SupportedTab {
    return SUPPORTED_TABS.find((tab) => tab === candidate) ?? 'assigned'
  }

  function hasSameIds (previous: Array<Ref<Issue>>, next: Array<Ref<Issue>>): boolean {
    return previous.length === next.length && previous.every((id, position) => id === next[position])
  }

  let subscribedIssueIds: Array<Ref<Issue>> = []
  let cancelledStatusIds: Array<Ref<IssueStatus>> = []

  const cancelledStatusQuery = createQuery()
  cancelledStatusQuery.query(
    tracker.class.IssueStatus,
    { category: task.statusCategory.Lost },
    (statuses) => {
      cancelledStatusIds = statuses.map((status) => status._id)
    }
  )

  const subscriptionQuery = createQuery()
  subscriptionQuery.query(
    core.class.Collaborator,
    {
      collaborator: account.uuid,
      attachedToClass: { $in: client.getHierarchy().getDescendants(tracker.class.Issue) }
    },
    (collaborators) => {
      const nextIds = collaborators.map((collaborator) => collaborator.attachedTo as Ref<Issue>)
      if (!hasSameIds(subscribedIssueIds, nextIds)) {
        subscribedIssueIds = nextIds
      }
    },
    { sort: { attachedTo: 1 }, projection: { attachedTo: 1 } }
  )

  $: activeTab = toSupportedTab($resolvedLocationStore.query?.mode)
  $: visibleTabs = config.filter(([tabId]) => SUPPORTED_TABS.some((tab) => tab === tabId))

  $: tabFilters = {
    assigned: { assignee: currentEmployee },
    created: { createdBy: { $in: account.socialIds } },
    subscribed: { _id: { $in: subscribedIssueIds } }
  } satisfies Record<SupportedTab, DocumentQuery<Issue>>

  $: issuesQuery = {
    ...tabFilters[activeTab],
    status: { $nin: cancelledStatusIds }
  } as DocumentQuery<Issue>

  $: modeSelectorProps = {
    config: visibleTabs,
    mode: activeTab,
    onChange: (pickedTab: string) => dispatch('action', { mode: pickedTab })
  } satisfies IModeSelector
</script>

<IssuesView
  query={issuesQuery}
  space={undefined}
  {icon}
  title={tracker.string.MyIssues}
  {modeSelectorProps}
  viewOptionDefaults={{ shouldShowAll: false }}
/>
