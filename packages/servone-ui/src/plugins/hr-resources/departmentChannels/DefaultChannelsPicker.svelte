<!-- services/servone/src/dept-channels does the joining; this only edits the list. -->
<script lang="ts">
  import type { Channel } from '@hcengineering/chunter'
  import type { Ref } from '@hcengineering/core'
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { createQuery, getClient, ObjectPopup } from '@hcengineering/presentation'
  import { Button, IconAdd, IconClose, Label, Section, showPopup } from '@hcengineering/ui'
  import { ObjectPresenter } from '@hcengineering/view-resources'
  import { onMount } from 'svelte'
  import { CHANNEL_CLASS, ensureDepartmentAttributes, type DepartmentWithChannels } from './setup'

  export let department: DepartmentWithChannels
  export let readonly: boolean = false

  const TITLE = 'hr:string:ServoneDefaultChannels' as IntlString
  const HINT = 'hr:string:ServoneDefaultChannelsHint' as IntlString
  const CHANNEL_ICON = 'chunter:icon:Hashtag' as Asset

  const client = getClient()
  const channelsQuery = createQuery()
  let channels: Channel[] = []

  $: selected = department.servoneDefaultChannels ?? []
  $: if (selected.length > 0) {
    channelsQuery.query(CHANNEL_CLASS, { _id: { $in: selected } }, (found) => {
      channels = found
    })
  } else {
    channelsQuery.unsubscribe()
    channels = []
  }

  onMount(() => {
    void ensureDepartmentAttributes(client)
  })

  async function save (next: Array<Ref<Channel>>): Promise<void> {
    await client.update(department, { servoneDefaultChannels: next })
  }

  function pick (ev: MouseEvent): void {
    showPopup(
      ObjectPopup,
      {
        _class: CHANNEL_CLASS,
        docQuery: { archived: false },
        multiSelect: true,
        closeAfterSelect: false,
        allowDeselect: true,
        selectedObjects: selected,
        type: 'presenter'
      },
      ev.target as HTMLElement,
      undefined,
      (next: Array<Ref<Channel>> | undefined) => {
        if (next !== undefined) void save(next)
      }
    )
  }
</script>

<Section id="servone-default-channels" label={TITLE} icon={CHANNEL_ICON}>
  <svelte:fragment slot="header">
    {#if !readonly}
      <Button icon={IconAdd} kind={'ghost'} on:click={pick} />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <div class="flex-col gap-2 mt-3">
      {#each channels as channel (channel._id)}
        <div class="flex-row-center gap-2">
          <ObjectPresenter _class={CHANNEL_CLASS} objectId={channel._id} value={channel} />
          {#if !readonly}
            <Button
              icon={IconClose}
              kind={'ghost'}
              size={'small'}
              on:click={() => void save(selected.filter((id) => id !== channel._id))}
            />
          {/if}
        </div>
      {/each}
      <span class="text-sm content-dark-color"><Label label={HINT} /></span>
    </div>
  </svelte:fragment>
</Section>
