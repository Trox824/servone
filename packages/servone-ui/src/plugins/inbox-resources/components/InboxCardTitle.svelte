<script lang="ts">
  import cardPlugin, { type Card } from '@hcengineering/card'
  import type { Doc } from '@hcengineering/core'
  import notification from '@hcengineering/notification'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { Component, Label, tooltip } from '@hcengineering/ui'
  import { getDocIdentifier, getDocTitle } from '@hcengineering/view-resources'
  import type { NavigationItem } from '../type'

  export let doc: Doc | undefined
  export let navItem: NavigationItem

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let fetchedIdentifier: string | undefined
  let fetchedTitle: string | undefined

  $: labelPresenter = hierarchy.classHierarchyMixin(
    navItem._class,
    notification.mixin.NotificationContextPresenter
  )?.labelPresenter
  $: hasLabelPresenter = labelPresenter !== undefined && navItem.type === 'legacy'
  $: isCardRow = hierarchy.isDerived(navItem._class, cardPlugin.class.Card)
  $: classLabel = hierarchy.getClass(doc?._class ?? navItem._class).label
  $: rowClassLabel = hierarchy.getClass(navItem._class).label
  $: cardTitle = doc !== undefined ? (doc as Card).title : ''

  $: ownName = doc !== undefined && 'name' in doc && typeof doc.name === 'string' ? doc.name : ''
  $: displayedTitle = fetchedTitle !== undefined && fetchedTitle !== '' ? fetchedTitle : ownName !== '' ? ownName : undefined
  $: titleLabel = displayedTitle !== undefined ? getEmbeddedLabel(displayedTitle) : rowClassLabel

  $: void loadTexts(navItem.type === 'legacy', doc)

  async function loadTexts (isLegacyRow: boolean, subject: Doc | undefined): Promise<void> {
    if (!isLegacyRow || subject === undefined) return
    fetchedIdentifier = await getDocIdentifier(client, subject._id, subject._class, subject)
    fetchedTitle = await getDocTitle(client, subject._id, subject._class, subject)
  }
</script>

<div class="labels">
  {#if isCardRow}
    <span class="title--bold overflow-label clear-mins"><Label label={classLabel} /></span>
    {#if doc !== undefined}
      <span class="title overflow-label clear-mins" use:tooltip={{ label: getEmbeddedLabel(cardTitle) }}>{cardTitle}</span>
    {/if}
  {:else}
    {#if hasLabelPresenter}
      {#if doc !== undefined && labelPresenter !== undefined}
        <Component is={labelPresenter} props={{ context: navItem.context, object: doc }} showLoading={false} />
      {/if}
    {:else if fetchedIdentifier !== undefined && fetchedIdentifier !== ''}
      <span class="title--bold overflow-label clear-mins" use:tooltip={{ label: getEmbeddedLabel(fetchedIdentifier) }}>{fetchedIdentifier}</span>
    {:else if displayedTitle !== undefined}
      <span class="title--bold overflow-label clear-mins"><Label label={rowClassLabel} /></span>
    {/if}
    {#if !hasLabelPresenter || displayedTitle !== undefined}
      <span class="title overflow-label clear-mins" use:tooltip={{ label: titleLabel }}><Label label={titleLabel} /></span>
    {/if}
  {/if}
</div>

<style>
  .labels {
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    height: 2.5rem;
    min-height: 2.5rem;
    max-height: 2.5rem;
    font-size: 0.875rem;
    color: var(--global-primary-TextColor);
  }

  .title {
    font-weight: 400;
    color: var(--global-primary-TextColor);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .title--bold {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--global-primary-TextColor);
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
