<script lang="ts">
  import type { Attachment } from '@hcengineering/attachment'
  import type { Ref } from '@hcengineering/core'
  import drive, { type Drive, type Folder } from '@hcengineering/drive'
  import { translate, type IntlString } from '@hcengineering/platform'
  import presentation, { Card, SpaceSelector } from '@hcengineering/presentation'
  import { addNotification, themeStore } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { ObjectBox, SimpleNotification } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'

  import { saveToDrive } from './save'
  import { saveToDriveStrings } from './strings'

  export let attachment: Attachment

  const ROOT_LABEL = 'drive:string:Root' as IntlString

  const dispatch = createEventDispatcher()

  let space: Ref<Drive> | undefined
  let selectedDrive: Drive | undefined
  let parent: Ref<Folder> = drive.ids.Root

  async function save (): Promise<void> {
    if (space === undefined) return
    await saveToDrive(attachment, space, parent ?? drive.ids.Root)
    const title = await translate(saveToDriveStrings.SavedToDrive, { drive: selectedDrive?.name ?? '' }, $themeStore.language)
    addNotification(title, attachment.name, SimpleNotification)
  }
</script>

<Card
  label={saveToDriveStrings.SaveToDrive}
  okAction={save}
  okLabel={presentation.string.Save}
  canSave={space !== undefined}
  on:close={() => dispatch('close')}
  on:changeContent
>
  <svelte:fragment slot="header">
    <span class="overflow-label">{attachment.name}</span>
  </svelte:fragment>

  <div class="flex-row-center gap-2 min-w-100">
    <SpaceSelector
      bind:space
      _class={drive.class.Drive}
      label={drive.string.Drive}
      iconWithEmoji={view.ids.IconWithEmoji}
      defaultIcon={drive.icon.Drive}
      kind={'regular'}
      size={'small'}
      on:object={(evt) => {
        selectedDrive = evt.detail ?? undefined
      }}
      on:change={() => {
        parent = drive.ids.Root
      }}
    />
    <ObjectBox
      bind:value={parent}
      _class={drive.class.Folder}
      label={ROOT_LABEL}
      docQuery={{ space }}
      kind={'regular'}
      size={'small'}
      searchField={'title'}
      allowDeselect={true}
      showNavigate={false}
      docProps={{ disabled: true, noUnderline: true }}
    />
  </div>
</Card>
