<script lang="ts">
  import { isArchivingMode } from '@hcengineering/core'
  import login from '@hcengineering/login'
  import { getResource, type IntlString } from '@hcengineering/platform'
  import presentation from '@hcengineering/presentation'
  import {
    closePopup,
    getCurrentLocation,
    isSameSegments,
    Label,
    Loading,
    type Location,
    locationStorageKeyId,
    locationToUrl,
    navigate,
    resolvedLocationStore
  } from '@hcengineering/ui'
  import { workbenchId } from '@hcengineering/workbench'
  import { Check } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { workspacesStore } from '../utils'

  const WORKSPACES = 'workbench:string:ServoneWorkspaces' as IntlString

  onMount(() => {
    void getResource(login.function.GetWorkspaces)
      .then(async (loadWorkspaces) => await loadWorkspaces())
      .then((loadedWorkspaces) => {
        $workspacesStore = loadedWorkspaces
      })
  })

  function readSavedLocation (workspaceUrl: string): Location | undefined {
    const rawEntry = localStorage.getItem(`${locationStorageKeyId}_${workspaceUrl}`)
    if (rawEntry === null) return undefined
    try {
      return JSON.parse(rawEntry)
    } catch (err) {
      if (err instanceof SyntaxError) return undefined
      throw err
    }
  }

  function openWorkspace (event: MouseEvent, workspaceUrl: string): void {
    if (event.metaKey || event.ctrlKey) return
    event.preventDefault()
    closePopup()
    closePopup()

    const currentLocation = getCurrentLocation()
    if (currentLocation.path[1] === workspaceUrl) return

    const savedLocation = readSavedLocation(workspaceUrl)
    if (savedLocation !== undefined && isSameSegments(savedLocation, currentLocation, 2)) {
      navigate(savedLocation)
    } else {
      navigate({ path: [workbenchId, workspaceUrl] })
    }
  }
</script>

{#if $workspacesStore.length === 0}
  <div class="antiPopup">
    <div class="flex items-center justify-center w-64 p-2">
      <Loading />
    </div>
  </div>
{:else}
  <div class="antiPopup">
    <div class="flex flex-col w-64 gap-1 p-2">
      <div class="px-2 pt-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground"><Label label={WORKSPACES} /></div>
      {#each $workspacesStore as workspace (workspace.uuid)}
        <a
          class="stealth flex items-center gap-2 p-2 rounded-md text-sm hover:bg-accent"
          href={locationToUrl({ path: [workbenchId, workspace.url] })}
          on:click={(event) => openWorkspace(event, workspace.url)}
        >
          <span class="grow min-w-0 truncate">
            {workspace.name || workspace.url}
            {#if isArchivingMode(workspace.mode)}
              {' - '}<Label label={presentation.string.Archived} />
            {/if}
          </span>
          {#if workspace.url === $resolvedLocationStore.path[1]}
            <Check class="size-4 shrink-0 text-muted-foreground" />
          {/if}
        </a>
      {/each}
    </div>
  </div>
{/if}
