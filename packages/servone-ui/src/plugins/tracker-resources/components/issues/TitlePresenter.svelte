<script lang="ts">
  import type { WithLookup } from '@hcengineering/core'
  import type { Issue } from '@hcengineering/tracker'
  import { DocNavLink } from '@hcengineering/view-resources'
  import tracker from '../../plugin'
  import ParentNamesPresenter from './ParentNamesPresenter.svelte'
  import BlockedBadge from '../../sprints/components/BlockedBadge.svelte'
  import AwaitingApprovalBadge from '../../sprints/components/AwaitingApprovalBadge.svelte'

  export let value: WithLookup<Issue>
  export let shouldUseMargin: boolean = false
  export let showParent: boolean = true
  export let grow: boolean = false
  export let kind: 'list' | undefined = undefined
  export let onClick: (() => void) | undefined = undefined
  export let disabled: boolean = false
  export let maxWidth: string | undefined = undefined
  export let minWidth: string | undefined = '1rem'

  $: isListRow = kind === 'list'
  $: growsToFill = grow && !isListRow
  $: titleStyle =
    (maxWidth !== undefined ? `max-width: ${maxWidth};` : '') + (minWidth !== undefined ? `min-width: ${minWidth};` : '')
</script>

{#if value}
  <span
    class="presenter-label select-text inline-flex items-center overflow-hidden {growsToFill
      ? 'grow shrink-[0.5]'
      : 'shrink'}"
    class:ml-2={shouldUseMargin}
    style={titleStyle}
    title={value.title}
  >
    <DocNavLink object={value} {onClick} component={tracker.component.EditIssue} shrink={1} {disabled} colorInherit>
      {value.title}
    </DocNavLink>
  </span>
  {#if isListRow}
    <BlockedBadge issueId={value._id} />
    <AwaitingApprovalBadge issue={value} />
  {/if}
  {#if showParent}
    <ParentNamesPresenter {value} />
  {/if}
  <slot />
{/if}

