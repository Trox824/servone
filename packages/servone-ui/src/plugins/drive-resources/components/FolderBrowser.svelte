<script lang="ts">
  import type { Doc, DocumentQuery, Ref, WithLookup } from '@hcengineering/core'
  import { permissionsStore } from '@hcengineering/contact-resources'
  import drive, { type Drive, type Folder } from '@hcengineering/drive'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import ui, {
    Button,
    IconMoreH,
    Label,
    Panel,
    Scroller,
    SearchInput,
    deviceOptionsStore as deviceInfo,
    getCurrentResolvedLocation,
    navigate
  } from '@hcengineering/ui'
  import view, { type Viewlet, type ViewOptions } from '@hcengineering/view'
  import {
    canCreateObject,
    DocAttributeBar,
    FilterBar,
    FilterButton,
    showMenu,
    ViewletContentView,
    ViewletSelector,
    ViewletSettingButton
  } from '@hcengineering/view-resources'
  import DrivePresenter from './DrivePresenter.svelte'
  import FolderHeader from './FolderHeader.svelte'
  import FileDropArea from './FileDropArea.svelte'
  import { ChevronLeft, FolderPlus, Plus, Upload } from '@lucide/svelte'
  import * as Empty from '../../../lib/components/ui/empty'
  import { Button as EmptyButton } from '../../../lib/components/ui/button'
  import { emptyCopy } from '../../../onboarding/empty-copy'
  import { getDriveLink, getFolderLink } from '../navigation'
  import { showCreateFolderPopup, uploadFilesToDrivePopup } from '../utils'

  export let space: Ref<Drive>
  export let parent: Ref<Folder>
  export let object: Drive | Folder | undefined = undefined
  export let readonly: boolean = false
  export let embedded: boolean = false
  export let type: 'drive' | 'folder'

  const childClass = drive.class.Resource
  const emptyPhoneLabel = 'drive:string:ServoneDriveEmptyPhone' as IntlString
  const emptyPhoneReadonlyLabel = 'drive:string:ServoneDriveEmptyPhoneReadonly' as IntlString
  const uploadLabel = 'drive:string:UploadFile' as IntlString
  const newFolderLabel = 'drive:string:CreateFolder' as IntlString

  let searchText = ''
  let viewlet: WithLookup<Viewlet> | undefined = undefined
  let viewOptions: ViewOptions | undefined = undefined
  let childCount: number | undefined = undefined

  $: baseQuery = { space, parent } as DocumentQuery<Doc>
  $: searchQuery = (searchText !== '' ? { ...baseQuery, $search: searchText } : baseQuery) as DocumentQuery<Doc>
  let resultQuery: DocumentQuery<Doc> = {}
  $: resultQuery = searchQuery

  $: canUpload = canCreateObject(drive.class.File, space, $permissionsStore)
  $: canCreateFolder = canCreateObject(drive.class.Folder, space, $permissionsStore)
  const canDrop = (): boolean => !readonly && canUpload

  let isSheetOpen = false
  $: isPhone = $deviceInfo.isMobile
  $: showAdd = isPhone && !readonly && (canUpload || canCreateFolder)
  $: phoneEmptyLabel = !readonly && canUpload ? emptyPhoneLabel : emptyPhoneReadonlyLabel

  function goBack (): void {
    if (object !== undefined && 'parent' in object) {
      navigate(object.parent === drive.ids.Root ? getDriveLink(space) : getFolderLink(object.parent))
      return
    }
    const loc = getCurrentResolvedLocation()
    loc.path.length = 3
    loc.path[3] = 'browser'
    loc.fragment = undefined
    loc.query = undefined
    navigate(loc)
  }

  function uploadHere (): void {
    isSheetOpen = false
    void uploadFilesToDrivePopup(space, parent)
  }

  function newFolderHere (): void {
    isSheetOpen = false
    void showCreateFolderPopup(space, parent)
  }

  const countQuery = createQuery()
  $: countQuery.query(childClass, { space, parent }, (found) => {
    childCount = found.total
  }, { limit: 1, total: true })

  $: isEmpty = childCount === 0 && searchText === ''
</script>

{#if space !== undefined && object}
  <Panel {embedded} allowClose={false} selectedAside={false}>
    <svelte:fragment slot="title">
      {#if isPhone}
        <Button
          icon={ChevronLeft}
          iconProps={{ size: 'medium' }}
          kind={'icon'}
          showTooltip={{ label: ui.string.Back }}
          dataId={'btnPhoneBack'}
          on:click={goBack}
        />
        <span class="fs-bold overflow-label">{'title' in object ? object.title : object.name}</span>
      {:else if type === 'drive'}
        <DrivePresenter value={object} shouldShowAvatar={false} disabled noUnderline />
      {:else}
        <FolderHeader object={object} />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="search">
      <SearchInput bind:value={searchText} collapsed />
      <FilterButton _class={childClass} {space} />
    </svelte:fragment>

    <svelte:fragment slot="utils">
      <ViewletSelector bind:viewlet viewletQuery={{ attachTo: childClass }} hidden={isPhone} />
      {#if !isPhone}
        <ViewletSettingButton bind:viewOptions bind:viewlet />
      {/if}
      <Button
        icon={IconMoreH}
        iconProps={{ size: 'medium' }}
        kind={'icon'}
        showTooltip={{ label: view.string.MoreActions, direction: 'bottom' }}
        on:click={(event) => {
          showMenu(event, { object })
        }}
      />
    </svelte:fragment>

    <svelte:fragment slot="aside">
      <Scroller>
        <DocAttributeBar {object} {readonly} ignoreKeys={[]} />
        <div class="space-divider bottom"></div>
      </Scroller>
    </svelte:fragment>

    {#if viewlet !== undefined && viewOptions}
      <FilterBar
        _class={childClass}
        {space}
        query={searchQuery}
        {viewOptions}
        on:change={(event) => {
          resultQuery = event.detail
        }}
      />
      <div class="popupPanel-body relative" on:contextmenu>
        <FileDropArea {space} {parent} {canDrop}>
          {#if isEmpty}
            <div class="flex h-full w-full p-3">
              <Empty.Root class="h-full">
                <Empty.Header>
                  <Empty.Title><Label label={isPhone ? phoneEmptyLabel : emptyCopy.drive} /></Empty.Title>
                </Empty.Header>
                {#if !isPhone && !readonly && canUpload}
                  <Empty.Content>
                    <EmptyButton size="sm" onclick={uploadHere}><Upload /><Label label={emptyCopy.driveAction} /></EmptyButton>
                  </Empty.Content>
                {/if}
              </Empty.Root>
            </div>
          {:else}
            <Scroller horizontal>
              <ViewletContentView _class={childClass} {viewlet} query={resultQuery} {space} {viewOptions} />
            </Scroller>
          {/if}
        </FileDropArea>
        {#if showAdd}
          <button type="button" class="fab" on:click={() => { isSheetOpen = true }}>
            <Plus size={24} />
            <span class="sr-only"><Label label={uploadLabel} /></span>
          </button>
        {/if}
        {#if isSheetOpen}
          <button type="button" class="scrim" aria-hidden="true" tabindex="-1" on:click={() => { isSheetOpen = false }}></button>
          <div class="sheet" role="menu">
            {#if canUpload}
              <button type="button" role="menuitem" on:click={uploadHere}>
                <Upload size={20} />
                <Label label={uploadLabel} />
              </button>
            {/if}
            {#if canCreateFolder}
              <button type="button" role="menuitem" on:click={newFolderHere}>
                <FolderPlus size={20} />
                <Label label={newFolderLabel} />
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </Panel>
{/if}

<style>
  .fab {
    position: absolute;
    right: 1rem;
    bottom: 1rem;
    z-index: 3;
    display: flex;
    width: 3.5rem;
    height: 3.5rem;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: var(--primary);
    color: var(--primary-foreground);
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.25);
  }
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 4;
    background: rgb(0 0 0 / 0.4);
  }
  .sheet {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    z-index: 5;
    padding: 0.5rem 0 0.75rem;
    border-radius: 1rem 1rem 0 0;
    background: var(--popover);
    color: var(--popover-foreground);
  }
  .sheet button {
    display: flex;
    width: 100%;
    height: 3.25rem;
    align-items: center;
    justify-content: flex-start;
    gap: 0.75rem;
    padding: 0 1.25rem;
    font-size: 0.9375rem;
    text-align: left;
  }
  :global(#ui-root.mobile-theme) .popupPanel-body :global(.antiTable) {
    min-width: 0;
  }
  :global(#ui-root.mobile-theme) .popupPanel-body :global(.antiTable:not(.metaColumn) :is(th, td):not(:first-child)),
  :global(#ui-root.mobile-theme) .popupPanel-body :global(.antiTable.metaColumn :is(th, td):nth-child(n + 3)) {
    display: none;
  }
</style>
