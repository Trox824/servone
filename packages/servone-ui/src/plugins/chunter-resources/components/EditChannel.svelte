<script lang="ts">
  import type { Channel, ChunterSpace } from '@hcengineering/chunter'
  import type { Class, Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { SpaceMembers } from '@hcengineering/contact-resources'
  import { Label, Panel, Scroller } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import chunter from '../plugin'
  import EditChannelDescriptionTab from './EditChannelDescriptionTab.svelte'
  import EditChannelSettingsTab from './EditChannelSettingsTab.svelte'

  export let object: ChunterSpace | undefined = undefined
  export let _id: Ref<ChunterSpace> | undefined = undefined
  export let _class: Ref<Class<ChunterSpace>> | undefined = undefined

  const dispatch = createEventDispatcher()
  const hierarchy = getClient().getHierarchy()
  const spaceQuery = createQuery()

  let space: ChunterSpace | undefined

  function watchSpace (spaceId: Ref<ChunterSpace> | undefined): void {
    if (spaceId === undefined) {
      spaceQuery.unsubscribe()
      return
    }
    spaceQuery.query(chunter.class.ChunterSpace, { _id: spaceId }, (spaces) => {
      space = spaces[0]
    })
  }

  $: spaceId = _id ?? object?._id
  $: spaceClass = _class ?? object?._class
  $: classDefinition = spaceClass !== undefined ? hierarchy.getClass(spaceClass) : undefined
  $: watchSpace(spaceId)
  $: isChannelClass = spaceClass === chunter.class.Channel
  $: isDirectMessageClass = spaceClass === chunter.class.DirectMessage
  $: channelSpace = space as Channel | undefined
</script>

<Panel isHeader={false} isAside={isChannelClass} on:open on:update on:close={() => dispatch('close')}>
  <svelte:fragment slot="title">
    {#if classDefinition !== undefined && space !== undefined}
      <div class="title">
        {#if isDirectMessageClass}
          <Label label={classDefinition.label} />
        {:else}
          <span class="trans-title content-color"><Label label={classDefinition.label} /> ›</span>
          {space.name}
        {/if}
      </div>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="aside">
    {#if isChannelClass && channelSpace !== undefined}
      <div class="flex-col-center">
        <div class="fs-title overflow-label mb-2 mt-4 text-xl">
          <Label label={chunter.string.Settings} />
        </div>
        {#key channelSpace._id}
          <EditChannelSettingsTab channel={channelSpace} on:close={() => dispatch('close')} />
        {/key}
      </div>
    {/if}
  </svelte:fragment>

  {#if space !== undefined}
    <Scroller>
      <div class="popupPanel-body__main-content clear-mins h-full py-10">
        <div class="flex shrink-0 flex-col">
          <div class="fs-title overflow-label mb-2 shrink-0 text-xl">
            <Label label={chunter.string.About} />
          </div>
          <EditChannelDescriptionTab channel={space} on:close={() => dispatch('close')} />
        </div>
        <div class="mt-10 flex shrink-0 flex-col">
          <div class="fs-title overflow-label mb-2 shrink-0 text-xl">
            <Label label={chunter.string.Members} />
          </div>
          <SpaceMembers {space} withAddButton />
        </div>
      </div>
    </Scroller>
  {/if}
</Panel>
