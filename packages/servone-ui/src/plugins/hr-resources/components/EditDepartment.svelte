<script lang="ts">
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { createFocusManager, EditBox, FocusHandler } from '@hcengineering/ui'
  import { ChannelsEditor, EditableAvatar } from '@hcengineering/contact-resources'
  import core, { getCurrentAccount, type Ref } from '@hcengineering/core'
  import type { Department } from '@hcengineering/hr'
  import setting, { type IntegrationType } from '@hcengineering/setting'
  import { createEventDispatcher, onMount } from 'svelte'
  import hr from '../plugin'
  import Members from './Members.svelte'
  import DefaultChannelsPicker from '../departmentChannels/DefaultChannelsPicker.svelte'

  export let object: Department
  export let readonly: boolean = false

  const dispatch = createEventDispatcher()
  const manager = createFocusManager()
  const integrationQuery = createQuery()

  let avatarEditor: EditableAvatar
  let integrations = new Set<Ref<IntegrationType>>()

  onMount(() => {
    dispatch('open', {
      ignoreKeys: ['comments', 'name', 'channels', 'private', 'archived'],
      collectionArrays: ['members']
    })
  })

  integrationQuery.query(
    setting.class.Integration,
    { createdBy: { $in: getCurrentAccount().socialIds }, disabled: false },
    (found) => {
      integrations = new Set(found.map((integration) => integration.type))
    }
  )

  async function replaceAvatar (): Promise<void> {
    if (object.avatar !== null && object.avatar !== undefined) {
      await avatarEditor.removeAvatar(object.avatar)
    }
    const fields = await avatarEditor.createAvatar()
    await getClient().diffUpdate(object, fields)
  }

  function saveName (): void {
    void getClient().update(object, { name: object.name })
  }
</script>

{#if object !== undefined}
  <FocusHandler {manager} />
  <div class="flex-row-stretch w-full step-tb-6">
    <div class="mr-8">
      {#key object}
        <EditableAvatar
          bind:this={avatarEditor}
          person={object}
          size={'x-large'}
          icon={hr.icon.Department}
          on:done={replaceAvatar}
        />
      {/key}
    </div>
    <div class="flex flex-col grow min-w-0">
      <div class="text-xl font-medium text-foreground">
        <EditBox
          placeholder={core.string.Name}
          bind:value={object.name}
          focusIndex={1}
          on:change={saveName}
        />
      </div>
      <div class="separator"></div>
      <div class="flex items-center">
        <ChannelsEditor
          attachedTo={object._id}
          attachedClass={object._class}
          {integrations}
          focusIndex={10}
        />
      </div>
    </div>
  </div>
  <Members department={object} members={object.members ?? []} {readonly} />
  <DefaultChannelsPicker department={object} {readonly} />
{/if}

<style>
  .separator {
    width: 100%;
    height: 1px;
    margin: 1rem 0;
    background-color: var(--border);
  }
</style>
