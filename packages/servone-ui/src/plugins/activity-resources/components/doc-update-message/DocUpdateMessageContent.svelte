<script lang="ts" context="module">
  import type { Ref, Space } from '@hcengineering/core'
  import { getResource, type Resource } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import tracker, { type Project } from '@hcengineering/tracker'

  const isWorkflowTypeId = 'servone-tracker:function:IsWorkflowType' as Resource<(type: string) => boolean>
  const workflowBySpace = new Map<Ref<Space>, Promise<boolean>>()

  function checkWorkflowSpace (space: Ref<Space>): Promise<boolean> {
    let pending = workflowBySpace.get(space)
    if (pending === undefined) {
      pending = (async () => {
        const project = await getClient().findOne<Project>(
          tracker.class.Project,
          { _id: space as Ref<Project> },
          { projection: { type: 1 } }
        )
        if (project === undefined) return false
        const isWorkflowType = await getResource(isWorkflowTypeId)
        return isWorkflowType(project.type)
      })()
      workflowBySpace.set(space, pending)
    }
    return pending
  }
</script>

<script lang="ts">
  import activity, {
    type DisplayDocUpdateMessage,
    type DocUpdateMessage,
    type DocUpdateMessageViewlet
  } from '@hcengineering/activity'
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { Icon, Label } from '@hcengineering/ui'
  import { str } from '../../../tracker-resources/sprints/plugin'
  import DocUpdateMessageObjectValue from './DocUpdateMessageObjectValue.svelte'

  export let message: DisplayDocUpdateMessage
  export let viewlet: DocUpdateMessageViewlet | undefined
  export let objectName: IntlString | undefined
  export let collectionName: IntlString | undefined
  export let objectIcon: Asset | undefined
  export let preview: boolean = false

  let objectLabel: IntlString | undefined

  $: earlier = (message.previousMessages ?? []) as DocUpdateMessage[]
  $: entries = [...earlier, message] as DocUpdateMessage[]
  $: isMixed = earlier.some((earlierMessage) => earlierMessage.action !== message.action)
  $: createdEntries = entries.filter((entry) => entry.action === 'create')
  $: removedEntries = entries.filter((entry) => entry.action === 'remove')
  $: icon = viewlet?.icon ?? objectIcon ?? activity.icon.Activity

  $: actionLabel = isMixed
    ? activity.string.UpdatedCollection
    : message.action === 'create'
      ? activity.string.New
      : message.action === 'remove' && message.updateCollection != null && message.updateCollection !== ''
        ? activity.string.Removed
        : undefined

  $: showCollection =
    collectionName !== undefined && (earlier.length > 0 || message.objectId !== message.attachedTo)
  $: kindLabel = showCollection ? collectionName : objectLabel

  $: void resolveObjectLabel(message, objectName)

  async function resolveObjectLabel (shown: DisplayDocUpdateMessage, name: IntlString | undefined): Promise<void> {
    if (shown.objectClass !== tracker.class.Issue) {
      objectLabel = name
      return
    }
    objectLabel = undefined
    const isWorkflow = await checkWorkflowSpace(shown.space)
    if (shown !== message || name !== objectName) return
    objectLabel = isWorkflow ? str.Item : name
  }

  function separated (list: DocUpdateMessage[], index: number): boolean {
    return index < list.length - 1
  }
</script>

<div class="content overflow-label root" class:preview>
  <div class="lead">
    <Icon {icon} size={'small'} />
  </div>
  {#if actionLabel !== undefined}
    <Label label={actionLabel} />
  {/if}
  {#if kindLabel !== undefined}
    <span class="lower"><Label label={kindLabel} />:</span>
  {/if}
  <div class="overflow-label values list" class:preview>
    {#if isMixed}
      {#each createdEntries as entry, index}
        <DocUpdateMessageObjectValue
          attachedTo={entry.attachedTo}
          objectClass={entry.objectClass}
          objectId={entry.objectId}
          action={entry.action}
          {viewlet}
          {preview}
          withIcon={index === 0}
          hasSeparator={separated(createdEntries, index)}
        />
      {/each}
      {#each removedEntries as entry, index}
        <DocUpdateMessageObjectValue
          attachedTo={entry.attachedTo}
          objectClass={entry.objectClass}
          objectId={entry.objectId}
          action={entry.action}
          {viewlet}
          {preview}
          withIcon={index === 0}
          hasSeparator={separated(removedEntries, index)}
        />
      {/each}
    {:else}
      {#each entries as entry, index}
        <DocUpdateMessageObjectValue
          attachedTo={entry.attachedTo}
          objectClass={entry.objectClass}
          objectId={entry.objectId}
          action={entry.action}
          {viewlet}
          {preview}
          hasSeparator={separated(entries, index)}
        />
      {/each}
    {/if}
  </div>
</div>

<style>
  .root {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    color: var(--global-primary-TextColor);
  }
  .root.preview {
    flex-wrap: nowrap;
  }
  .lead {
    display: flex;
    margin-right: 4px;
  }
  .list {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
  }
  .list.preview {
    flex-wrap: nowrap;
  }
</style>
