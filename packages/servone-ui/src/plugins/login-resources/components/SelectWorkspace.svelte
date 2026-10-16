<script lang="ts">
  import { type WorkspaceInfoWithStatus, isActiveMode, isArchivingMode, isRestoringMode, isUpgradingMode } from '@hcengineering/core'
  import type { LoginInfo } from '@hcengineering/login'
  import { type IntlString, OK, Severity, type Status, getMetadata, translate } from '@hcengineering/platform'
  import presentation, { MessageBox, isAdminUser, reduceCalls } from '@hcengineering/presentation'
  import { Label, showPopup, themeStore, ticker } from '@hcengineering/ui'
  import { logOut } from '@hcengineering/workbench'
  import { ChevronRight, LoaderCircle } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import type { BottomAction } from '..'
  import login from '../plugin'
  import {
    getAccount,
    getAccountDisplayName,
    getWorkspaces,
    goTo,
    isReadOnlyGuestAccount,
    navigateToWorkspace,
    selectWorkspace,
    unArchive
  } from '../utils'
  import BottomActionComponent from './BottomAction.svelte'
  import StatusControl from './StatusControl.svelte'
  import { Button } from '../../../lib/components/ui/button'
  import { Input } from '../../../lib/components/ui/input'
  import { Skeleton } from '../../../lib/components/ui/skeleton'

  export let navigateUrl: string | undefined = undefined

  const SEARCH_MIN_WORKSPACES = 6
  const MAX_VISIBLE_WORKSPACES = 500
  const RESTORE_POLL_MS = 5000
  const MS_PER_DAY = 86400000

  const findWorkspaceLabel = 'login:string:ServoneFindWorkspace' as IntlString
  const noMatchLabel = 'login:string:ServoneNoWorkspaceMatch' as IntlString
  const noWorkspaceYetLabel = 'login:string:ServoneNoWorkspaceYet' as IntlString
  const preparingLabel = 'login:string:ServoneWorkspacePreparing' as IntlString
  const lastActiveLabel = 'login:string:ServoneLastActive' as IntlString

  const isSignUpDisabled = getMetadata(login.metadata.DisableSignUp) ?? false

  let account: LoginInfo | null | undefined
  let isReadOnlyGuest = true
  let accountRequest: Promise<LoginInfo | null> | undefined
  let workspaces: WorkspaceInfoWithStatus[] | undefined
  let isLiveRefreshOn = false
  let searchText = ''
  let searchLabel = ''
  let enteringUrl: string | undefined
  let status: Status = OK

  function requestAccount (): Promise<LoginInfo | null> {
    accountRequest ??= getAccount()
    return accountRequest
  }

  const refreshWorkspaces = reduceCalls(async () => {
    workspaces = await getWorkspaces()
  })

  async function loadWorkspaces (): Promise<void> {
    try {
      const loadedWorkspaces = await getWorkspaces()
      const loadedAccount = await requestAccount()
      if (loadedWorkspaces.length === 0 && (loadedAccount == null || !loadedAccount.token)) {
        goTo('confirmationSend')
      }
      workspaces = loadedWorkspaces
      isLiveRefreshOn = true
    } catch (err) {
      await logOut()
      goTo('login')
      throw err
    }
  }

  void loadWorkspaces()

  onMount(() => {
    void requestAccount()
      .then(async (loadedAccount) => {
        account = loadedAccount
        isReadOnlyGuest = await isReadOnlyGuestAccount(loadedAccount)
      })
  })

  function normalise (text: string): string {
    return text
      .trim()
      .toLocaleLowerCase('vi')
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
  }

  function displayName (workspace: WorkspaceInfoWithStatus): string {
    return workspace.name ?? workspace.url
  }

  function avatarLetter (workspace: WorkspaceInfoWithStatus): string {
    const [firstLetter] = Array.from(displayName(workspace).trim())
    return firstLetter === undefined ? '?' : firstLetter.toLocaleUpperCase('vi')
  }

  function isPreparing (workspace: WorkspaceInfoWithStatus): boolean {
    return !isActiveMode(workspace.mode) && !isArchivingMode(workspace.mode)
  }

  function relativeLastVisit (lastVisit: number, language: string | undefined): string {
    const daysAgo = Math.floor((Date.now() - lastVisit) / MS_PER_DAY)
    return new Intl.RelativeTimeFormat(language ?? 'en', { numeric: 'auto' })
      .format(-daysAgo, 'day')
      .toLocaleLowerCase(language)
  }

  function isStillRestoring (list: WorkspaceInfoWithStatus[], uuid: string): boolean {
    const restoring = list.find((workspace) => workspace.uuid === uuid)
    return restoring !== undefined && (isRestoringMode(restoring.mode) || isUpgradingMode(restoring.mode))
  }

  async function waitForRestore (uuid: string): Promise<void> {
    let latest = await getWorkspaces()
    workspaces = latest
    while (isStillRestoring(latest, uuid)) {
      await new Promise((resolve) => setTimeout(resolve, RESTORE_POLL_MS))
      latest = await getWorkspaces()
      workspaces = latest
    }
  }

  async function enterWorkspace (url: string): Promise<void> {
    enteringUrl = url
    status = OK
    const [enterStatus, loginInfo] = await selectWorkspace(url).finally(() => {
      enteringUrl = undefined
    })
    const archivedWorkspace = (workspaces ?? []).find((workspace) => workspace.uuid === loginInfo?.workspace)
    if (archivedWorkspace !== undefined && isArchivingMode(archivedWorkspace.mode) && loginInfo?.workspace !== undefined) {
      const sessionToken = loginInfo.token
      showPopup(MessageBox, {
        label: login.string.SelectWorkspace,
        message: login.string.WorkspaceArchivedDesc,
        canSubmit: true,
        params: {},
        okLabel: login.string.RestoreArchivedWorkspace,
        action: async () => {
          if (await unArchive(archivedWorkspace.uuid, sessionToken)) {
            await waitForRestore(archivedWorkspace.uuid)
          }
        }
      })
      status = enterStatus
      return
    }
    status = enterStatus
    navigateToWorkspace(url, loginInfo, navigateUrl)
  }

  const switchAccountAction: BottomAction = {
    caption: login.string.NotSeeingWorkspace,
    i18n: login.string.ChangeAccount,
    page: 'login',
    func: () => {
      void logOut().then(() => {
        goTo('login')
      })
    }
  }

  const createWorkspaceAction: BottomAction = {
    caption: login.string.WantAnotherWorkspace,
    i18n: login.string.CreateWorkspace,
    page: 'createWorkspace',
    func: () => {
      goTo('createWorkspace')
    }
  }

  $: canCreateWorkspace = !isReadOnlyGuest && (isAdminUser() || !isSignUpDisabled)
  $: hasWorkspaces = workspaces !== undefined && workspaces.length > 0
  $: footerActions = canCreateWorkspace && hasWorkspaces
    ? [createWorkspaceAction, switchAccountAction]
    : [switchAccountAction]

  $: if (isLiveRefreshOn && $ticker !== undefined) void refreshWorkspaces()

  $: void translate(findWorkspaceLabel, {}, $themeStore.language).then((text) => {
    searchLabel = text
  })

  $: normalisedSearch = normalise(searchText)
  $: matchingWorkspaces = (workspaces ?? [])
    .filter(
      (workspace) =>
        normalisedSearch === '' ||
        normalise(workspace.name ?? '').includes(normalisedSearch) ||
        normalise(workspace.url).includes(normalisedSearch)
    )
    .slice(0, MAX_VISIBLE_WORKSPACES)
  $: showSearch = workspaces !== undefined && workspaces.length >= SEARCH_MIN_WORKSPACES
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-col gap-1.5">
    <h1 class="m-0 text-lg font-semibold leading-none tracking-tight">
      <Label label={login.string.SelectWorkspace} />
    </h1>
    {#if account == null}
      <Skeleton class="h-5 w-32" />
    {:else}
      <p class="m-0 truncate text-sm text-muted-foreground">{getAccountDisplayName(account)}</p>
    {/if}
  </div>

  {#if status.severity !== Severity.OK}
    <StatusControl {status} />
  {/if}

  {#if workspaces === undefined}
    <div class="flex flex-col gap-2" aria-busy="true">
      <Skeleton class="h-14 w-full rounded-lg" />
      <Skeleton class="h-14 w-full rounded-lg" />
    </div>
  {:else}
    {#if showSearch}
      <!-- svelte-ignore a11y_autofocus -->
      <Input type="search" bind:value={searchText} placeholder={searchLabel} aria-label={searchLabel} autofocus />
    {/if}

    {#if workspaces.length === 0 && account?.token}
      {#if canCreateWorkspace}
        <Button class="w-full" onclick={() => goTo('createWorkspace')}>
          <Label label={login.string.CreateWorkspace} />
        </Button>
      {:else}
        <p class="m-0 text-sm text-muted-foreground"><Label label={noWorkspaceYetLabel} /></p>
      {/if}
    {:else if matchingWorkspaces.length === 0 && normalisedSearch !== ''}
      <p class="m-0 text-sm text-muted-foreground">
        <Label label={noMatchLabel} params={{ query: searchText.trim() }} />
      </p>
    {:else}
      <ul class="m-0 list-none overflow-hidden rounded-lg border border-border p-0">
        {#each matchingWorkspaces as workspace (workspace.uuid)}
          {@const preparing = isPreparing(workspace)}
          {@const progress = workspace.processingProgress ?? 0}
          <li class="border-b border-border last:border-b-0">
            <button
              type="button"
              title={displayName(workspace)}
              disabled={preparing || enteringUrl !== undefined}
              class="group flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 enabled:hover:bg-muted disabled:cursor-default {enteringUrl !==
                undefined && enteringUrl !== workspace.url
                ? 'opacity-50'
                : ''}"
              on:click={() => enterWorkspace(workspace.url)}
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium text-foreground"
                aria-hidden="true"
              >
                {avatarLetter(workspace)}
              </span>
              <span class="flex min-w-0 grow flex-col">
                <span class="truncate text-sm font-medium text-foreground">{displayName(workspace)}</span>
                <span class="truncate text-xs text-muted-foreground">
                  {workspace.url}
                  {#if preparing}
                    · <Label label={preparingLabel} params={{ progress }} />
                  {:else if isArchivingMode(workspace.mode)}
                    · <Label label={presentation.string.Archived} />
                  {:else if workspace.lastVisit !== undefined}
                    · <Label
                      label={lastActiveLabel}
                      params={{ when: relativeLastVisit(workspace.lastVisit, $themeStore.language) }}
                    />
                  {/if}
                </span>
              </span>
              {#if enteringUrl === workspace.url}
                <LoaderCircle class="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
              {:else if preparing}
                <span class="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span class="block h-full rounded-full bg-primary" style:width="{progress}%"></span>
                </span>
              {:else}
                <ChevronRight
                  class="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-visible:opacity-100 group-enabled:group-hover:opacity-100"
                  aria-hidden="true"
                />
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="flex flex-col items-center gap-1 text-center">
      {#each footerActions as footerAction (footerAction.i18n)}
        <BottomActionComponent action={footerAction} />
      {/each}
    </div>
  {/if}
</div>
