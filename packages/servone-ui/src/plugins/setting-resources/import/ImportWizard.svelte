<script lang="ts">
  import { getAccountClient } from '@hcengineering/contact-resources'
  import login from '@hcengineering/login'
  import type { IntlString } from '@hcengineering/platform'
  import { getClient, isDisabled } from '@hcengineering/presentation'
  import { Label, Loading, Spinner, getCurrentLocation, navigate, showPopup } from '@hcengineering/ui'
  import { Check, FileUp, Plug, Square } from '@lucide/svelte'
  import {
    sources,
    type ApiCall,
    type Connector,
    type FetchProgress,
    type FileImport,
    type ImportBundle,
    type PersonRef,
    type ScopeOption,
    type Source,
    type SourceArea,
    type SourceId
  } from '@servone/import'
  import { onDestroy } from 'svelte'
  import { Button as UiButton } from '../../../lib/components/ui/button'
  import { Checkbox } from '../../../lib/components/ui/checkbox'
  import { Switch } from '../../../lib/components/ui/switch'
  import { addMember } from '../../../lib/people/add-member'
  import { splitFullName } from '../../hr-resources/org-chart/import/plan'
  import {
    awaitConnection,
    ConnectFailure,
    connectionApi,
    endConnection,
    isAccessLost,
    listConnectable,
    postService,
    startConnect,
    type ConnectFailureReason
  } from './connect'
  import {
    collectPeople,
    docCount,
    ImportFailure,
    itemCount,
    matchPeople,
    newcomers,
    runImport,
    type ImportCounts,
    type ImportProgress,
    type Newcomer,
    type Post
  } from './run'
  import ScopePicker from './ScopePicker.svelte'

  export let base: string

  type Step = 'source' | 'file' | 'connect' | 'choose' | 'fetching' | 'review' | 'running' | 'failed' | 'done'
  type Mode = 'file' | 'connect'

  interface Unit {
    key: string
    name: string
    countLabel: IntlString
    count: number
  }

  interface UnitGroup {
    label: IntlString
    units: Unit[]
  }

  function importString (key: string): IntlString {
    return `setting:string:ServoneImport${key}` as IntlString
  }

  const AREAS: Array<{ area: SourceArea, label: IntlString, hint: IntlString }> = [
    { area: 'tracker', label: importString('Tracker'), hint: importString('TrackerHint') },
    { area: 'chat', label: importString('Chat'), hint: importString('ChatHint') },
    { area: 'documents', label: importString('Documents'), hint: importString('DocumentsHint') }
  ]

  const AREA_COUNT: Record<SourceArea, IntlString> = {
    tracker: importString('IssueCount'),
    chat: importString('MessageCount'),
    documents: importString('DocCount')
  }

  const EXPORT_STEPS: Partial<Record<SourceId, IntlString>> = {
    linear: importString('StepsLinear'),
    clickup: importString('StepsClickup'),
    jira: importString('StepsJira'),
    asana: importString('StepsAsana'),
    trello: importString('StepsTrello'),
    slack: importString('StepsSlack'),
    notion: importString('StepsNotion')
  }

  const CONNECT_FAILURES: Record<ConnectFailureReason, IntlString> = {
    blocked: importString('ConnectBlocked'),
    closed: importString('ConnectClosed'),
    denied: importString('ConnectDenied'),
    expired: importString('ConnectExpired'),
    failed: importString('ConnectFailed'),
    not_configured: importString('ConnectNotConfigured')
  }

  const FILE_STEPS = [importString('StepSource'), importString('StepExport'), importString('StepReview'), importString('StepImport')]
  const CONNECT_STEPS = [
    importString('StepSource'),
    importString('StepConnect'),
    importString('StepChoose'),
    importString('StepReview'),
    importString('StepImport')
  ]

  const FILE_INDEX: Record<Step, number> = { source: 0, file: 1, connect: 1, choose: 1, fetching: 1, review: 2, running: 3, failed: 3, done: 3 }
  const CONNECT_INDEX: Record<Step, number> = { source: 0, file: 1, connect: 1, choose: 2, fetching: 2, review: 3, running: 4, failed: 4, done: 4 }

  const POPUP_WIDTH = 520
  const POPUP_HEIGHT = 680

  const canInvite = !isDisabled('invites')
  const serviceOrigin = new URL(base, window.location.href).origin
  const hasConnectors = sources.some((option) => option.connector !== undefined)
  const post: Post = async (request) => await postService(base, '/v1/import', request)

  let step: Step = 'source'
  let mode: Mode = 'file'
  let source: Source | undefined
  let connectable: Set<SourceId> | undefined = hasConnectors ? undefined : new Set()
  let connectableError = ''
  let fileInput: HTMLInputElement
  let fileName = ''
  let isReading = false
  let readError = ''
  let emptyWarnings: string[] | undefined
  let bundle: ImportBundle | undefined
  let excluded = new Set<string>()
  let people: PersonRef[] = []
  let matches: Array<string | null> | undefined
  let matchError = ''
  let isAddingPeople = true
  let peopleProgress: { done: number, total: number } | undefined
  let addedCount = 0
  let notAdded: Array<{ email: string, error: string }> = []
  let progress: ImportProgress | undefined
  let counts: ImportCounts | undefined
  let failure: ImportFailure | undefined

  let activeConnector: Connector | undefined
  let connection: string | undefined
  let api: ApiCall | undefined
  let connectController: AbortController | undefined
  let connectError: Error | undefined
  let scopes: ScopeOption[] | undefined
  let scopeError: Error | undefined
  let selectedScopes = new Set<string>()
  let fetchController: AbortController | undefined
  let fetchProgress: FetchProgress | undefined
  let fetchError: Error | undefined

  $: destinations = connectable === undefined ? [] : visibleAreas(connectable)
  $: isConnectFlow = step === 'source' ? destinations.some((area) => area.sources.some((option) => connectorOf(option) !== undefined)) : mode === 'connect'
  $: stepLabels = isConnectFlow ? CONNECT_STEPS : FILE_STEPS
  $: currentIndex = (isConnectFlow ? CONNECT_INDEX : FILE_INDEX)[step]
  $: unitGroups = bundle === undefined ? [] : groupUnits(bundle)
  $: selection = bundle === undefined ? undefined : select(bundle, excluded)
  $: selectedCount = selection === undefined ? 0 : itemCount(selection)
  $: joining = matches === undefined ? [] : newcomers(people, matches)
  $: joiningEmails = new Set(joining.map((person) => person.email.toLowerCase()))
  $: running = peopleProgress ?? progress
  $: percent = running === undefined || running.total === 0 ? 0 : Math.round((running.done / running.total) * 100)

  if (hasConnectors) void loadConnectable()

  onDestroy(closeConnection)

  async function loadConnectable (): Promise<void> {
    try {
      connectable = await listConnectable(base, sources)
    } catch (error) {
      connectableError = error instanceof Error ? error.message : String(error)
      connectable = new Set()
    }
  }

  function connectorOf (option: Source): Connector | undefined {
    return connectable?.has(option.id) === true ? option.connector : undefined
  }

  function visibleAreas (ready: Set<SourceId>): Array<(typeof AREAS)[number] & { sources: Source[] }> {
    return AREAS.map((area) => ({
      ...area,
      sources: sources.filter(
        (option) => option.area === area.area && (option.file !== undefined || (option.connector !== undefined && ready.has(option.id)))
      )
    })).filter((area) => area.sources.length > 0)
  }

  function groupUnits (parsed: ImportBundle): UnitGroup[] {
    const groups: UnitGroup[] = [
      {
        label: importString('Projects'),
        units: parsed.projects.map((project, index) => ({
          key: `project:${index}`,
          name: project.name,
          countLabel: importString('IssueCount'),
          count: project.issues.length
        }))
      },
      {
        label: importString('Channels'),
        units: parsed.channels.map((channel, index) => ({
          key: `channel:${index}`,
          name: channel.name,
          countLabel: importString('MessageCount'),
          count: channel.messages.length
        }))
      },
      {
        label: importString('Teamspaces'),
        units: parsed.teamspaces.map((teamspace, index) => ({
          key: `teamspace:${index}`,
          name: teamspace.name,
          countLabel: importString('DocCount'),
          count: docCount(teamspace.docs)
        }))
      }
    ]
    return groups.filter((group) => group.units.length > 0)
  }

  function select (parsed: ImportBundle, skipped: Set<string>): ImportBundle {
    return {
      projects: parsed.projects.filter((_, index) => !skipped.has(`project:${index}`)),
      channels: parsed.channels.filter((_, index) => !skipped.has(`channel:${index}`)),
      teamspaces: parsed.teamspaces.filter((_, index) => !skipped.has(`teamspace:${index}`)),
      warnings: parsed.warnings
    }
  }

  function countRows (imported: ImportCounts): Array<[IntlString, number]> {
    const rows: Array<[IntlString, number]> = [
      [importString('ProjectCount'), imported.projects],
      [importString('IssueCount'), imported.issues],
      [importString('ChannelCount'), imported.channels],
      [importString('MessageCount'), imported.messages],
      [importString('TeamspaceCount'), imported.teamspaces],
      [importString('DocCount'), imported.docs],
      [importString('PeopleAdded'), addedCount]
    ]
    return rows.filter(([, count]) => count > 0)
  }

  function closeConnection (): void {
    connectController?.abort()
    fetchController?.abort()
    connectController = undefined
    fetchController = undefined
    if (connection !== undefined) void endConnection(base, connection)
    connection = undefined
    api = undefined
    activeConnector = undefined
    connectError = undefined
    scopes = undefined
    scopeError = undefined
    fetchError = undefined
    fetchProgress = undefined
  }

  function chooseFile (option: Source): void {
    closeConnection()
    source = option
    mode = 'file'
    fileName = ''
    readError = ''
    emptyWarnings = undefined
    step = 'file'
  }

  function startOver (): void {
    closeConnection()
    source = undefined
    bundle = undefined
    progress = undefined
    counts = undefined
    failure = undefined
    step = 'source'
  }

  function popupFeatures (): string {
    const left = Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2)
    const top = Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2)
    return `popup,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`
  }

  function connect (option: Source, connector: Connector): void {
    const popup = window.open('', '_blank', popupFeatures())
    closeConnection()
    source = option
    mode = 'connect'
    activeConnector = connector
    emptyWarnings = undefined
    step = 'connect'
    if (popup === null) {
      connectError = new ConnectFailure('blocked')
      return
    }
    void waitForConnection(option, connector, popup)
  }

  async function waitForConnection (option: Source, connector: Connector, popup: Window): Promise<void> {
    const controller = new AbortController()
    connectController = controller
    try {
      popup.location.href = await startConnect(base, option.id)
      const opened = await awaitConnection(popup, serviceOrigin, option.id, controller.signal)
      connection = opened
      api = connectionApi(base, opened)
      step = 'choose'
      void loadScopes(connector, api)
    } catch (error) {
      popup.close()
      if (!controller.signal.aborted) connectError = error instanceof Error ? error : new Error(String(error))
    } finally {
      if (connectController === controller) connectController = undefined
    }
  }

  async function loadScopes (connector: Connector, callApi: ApiCall): Promise<void> {
    scopes = undefined
    scopeError = undefined
    try {
      const listed = await connector.listScopes(callApi)
      if (api !== callApi) return
      scopes = listed
      selectedScopes = new Set(listed.filter((scope) => scope.isSelected).map((scope) => scope.id))
    } catch (error) {
      if (api === callApi) scopeError = error instanceof Error ? error : new Error(String(error))
    }
  }

  async function fetchSelected (connector: Connector, callApi: ApiCall, ids: string[]): Promise<void> {
    const controller = new AbortController()
    fetchController = controller
    fetchProgress = undefined
    fetchError = undefined
    emptyWarnings = undefined
    step = 'fetching'
    try {
      const fetched = await connector.fetch(
        callApi,
        ids,
        (next) => {
          if (fetchController === controller) fetchProgress = next
        },
        controller.signal
      )
      if (fetchController !== controller) return
      if (itemCount(fetched) === 0) {
        emptyWarnings = fetched.warnings
        step = 'choose'
        return
      }
      bundle = fetched
      excluded = new Set()
      step = 'review'
      void matchBundle(fetched)
    } catch (error) {
      if (fetchController !== controller) return
      step = 'choose'
      if (!controller.signal.aborted) fetchError = error instanceof Error ? error : new Error(String(error))
    } finally {
      if (fetchController === controller) fetchController = undefined
    }
  }

  async function readFile (input: HTMLInputElement, file: FileImport): Promise<void> {
    const picked = input.files?.[0]
    input.value = ''
    if (picked === undefined) return
    fileName = picked.name
    readError = ''
    emptyWarnings = undefined
    isReading = true
    try {
      const parsed = file.parse({ name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) })
      if (itemCount(parsed) === 0) {
        emptyWarnings = parsed.warnings
        return
      }
      bundle = parsed
      excluded = new Set()
      step = 'review'
      void matchBundle(parsed)
    } catch (error) {
      readError = error instanceof Error ? error.message : String(error)
    } finally {
      isReading = false
    }
  }

  async function matchBundle (parsed: ImportBundle): Promise<void> {
    people = collectPeople(parsed)
    matches = undefined
    matchError = ''
    try {
      const found = await matchPeople(people, post)
      if (bundle === parsed) matches = found
    } catch (error) {
      if (bundle === parsed) matchError = error instanceof Error ? error.message : String(error)
    }
  }

  function setIncluded (key: string, isIncluded: boolean): void {
    if (isIncluded) excluded.delete(key)
    else excluded.add(key)
    excluded = excluded
  }

  async function addPeople (joiningPeople: Newcomer[]): Promise<void> {
    const client = getClient()
    const accounts = getAccountClient()
    for (const [index, person] of joiningPeople.entries()) {
      peopleProgress = { done: index, total: joiningPeople.length }
      const { firstName, lastName } = splitFullName(person.name ?? person.email.split('@')[0])
      try {
        await addMember(client, accounts, { email: person.email, firstName, lastName, position: null }, canInvite)
        addedCount++
      } catch (error) {
        notAdded = [...notAdded, { email: person.email, error: error instanceof Error ? error.message : String(error) }]
      }
    }
    peopleProgress = undefined
  }

  async function start (selected: ImportBundle, joiningPeople: Newcomer[]): Promise<void> {
    failure = undefined
    progress = undefined
    addedCount = 0
    notAdded = []
    step = 'running'
    if (joiningPeople.length > 0) {
      await addPeople(joiningPeople)
      try {
        matches = await matchPeople(people, post)
      } catch (error) {
        matches = undefined
        matchError = error instanceof Error ? error.message : String(error)
        step = 'review'
        return
      }
    }
    progress = { unit: '', done: 0, total: itemCount(selected) }
    try {
      counts = await runImport(selected, post, (next) => {
        progress = next
      })
      step = 'done'
      closeConnection()
    } catch (error) {
      if (!(error instanceof ImportFailure)) throw error
      failure = error
      step = 'failed'
    }
  }

  function openApp (alias: string): void {
    const loc = getCurrentLocation()
    navigate({ path: [loc.path[0], loc.path[1], alias] })
  }
</script>

<p class="text-sm text-muted-foreground"><Label label={importString('Intro')} /></p>

<ol class="mt-5 flex flex-wrap items-center gap-2 text-xs">
  {#each stepLabels as label, index}
    <li class="flex items-center gap-2">
      {#if index > 0}<span class="h-px w-5 bg-border"></span>{/if}
      <span
        class="flex items-center gap-1.5 {index === currentIndex
          ? 'font-medium text-foreground'
          : 'text-muted-foreground'}"
      >
        <span
          class="flex size-4 items-center justify-center rounded-full border text-[10px] tabular-nums {index < currentIndex
            ? 'border-primary bg-primary text-primary-foreground'
            : index === currentIndex
              ? 'border-primary text-primary'
              : 'border-border'}"
        >
          {index + 1}
        </span>
        <Label {label} />
      </span>
    </li>
  {/each}
</ol>

{#if step === 'source'}
  {#if connectable === undefined}
    <div class="mt-6"><Loading size="small" /></div>
  {:else}
    {#if connectableError !== ''}
      <p class="mt-6 text-xs text-muted-foreground"><Label label={importString('ConnectCheckFailed')} params={{ error: connectableError }} /></p>
    {/if}
    {#each destinations as destination (destination.area)}
      <section class="mt-6 flex flex-col gap-2">
        <div class="flex items-baseline justify-between gap-4">
          <span class="text-sm font-medium text-foreground"><Label label={destination.label} /></span>
          <span class="text-xs text-muted-foreground"><Label label={destination.hint} /></span>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {#each destination.sources as option (option.id)}
            {@const connector = connectorOf(option)}
            <div class="flex flex-col rounded-lg border border-border transition-colors hover:bg-muted">
              <button
                type="button"
                class="flex flex-1 flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                on:click={() => {
                  if (connector !== undefined) connect(option, connector)
                  else chooseFile(option)
                }}
              >
                <span class="text-sm font-medium text-foreground">{option.name}</span>
                {#if connector !== undefined}
                  <span class="flex items-center gap-1 text-xs text-primary">
                    <Plug class="size-3" /><Label label={importString('ConnectSource')} params={{ source: option.name }} />
                  </span>
                {:else if option.file !== undefined}
                  <span class="text-xs text-muted-foreground"><Label label={importString('FileType')} params={{ type: option.file.accept }} /></span>
                {/if}
              </button>
              {#if connector !== undefined && option.file !== undefined}
                <button
                  type="button"
                  class="rounded-lg px-3 pb-2.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  on:click={() => {
                    chooseFile(option)
                  }}
                >
                  <Label label={importString('UploadInstead')} />
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
{:else if step === 'file' && source !== undefined && source.file !== undefined}
  {@const chosen = source}
  {@const file = source.file}
  {@const exportSteps = EXPORT_STEPS[chosen.id]}
  <section class="mt-6 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <span class="text-sm font-medium text-foreground"><Label label={importString('ExportFrom')} params={{ source: chosen.name }} /></span>
      <UiButton variant="ghost" size="sm" onclick={startOver}><Label label={importString('ChangeSource')} /></UiButton>
    </div>
    {#if exportSteps !== undefined}
      <p class="text-sm text-muted-foreground"><Label label={exportSteps} /></p>
    {/if}
    <div class="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-4">
      <input
        bind:this={fileInput}
        type="file"
        accept={file.accept}
        class="hidden"
        on:change={() => {
          void readFile(fileInput, file)
        }}
      />
      <UiButton
        size="sm"
        disabled={isReading}
        onclick={() => {
          fileInput.click()
        }}
      >
        <FileUp />
        <Label label={importString('ChooseFile')} params={{ type: file.accept }} />
      </UiButton>
      {#if isReading}
        <span class="truncate text-sm text-muted-foreground"><Label label={importString('Reading')} params={{ name: fileName }} /></span>
      {:else if fileName !== ''}
        <span class="truncate text-sm text-muted-foreground">{fileName}</span>
      {/if}
    </div>
    {#if readError !== ''}
      <p class="text-sm text-destructive"><Label label={importString('ReadFailed')} params={{ name: fileName, error: readError }} /></p>
    {:else if emptyWarnings !== undefined}
      <p class="text-sm text-destructive">
        <Label label={importString('Empty')} params={{ name: fileName, source: chosen.name }} />
      </p>
      {#if emptyWarnings.length > 0}
        <ul class="list-disc pl-5 text-sm text-muted-foreground">
          {#each emptyWarnings as warning}<li>{warning}</li>{/each}
        </ul>
      {/if}
    {/if}
  </section>
{:else if step === 'connect' && source !== undefined && activeConnector !== undefined}
  {@const chosen = source}
  {@const connector = activeConnector}
  <section class="mt-6 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <span class="text-sm font-medium text-foreground"><Label label={importString('ConnectSource')} params={{ source: chosen.name }} /></span>
      <UiButton variant="ghost" size="sm" onclick={startOver}><Label label={importString('ChangeSource')} /></UiButton>
    </div>
    {#if connectError === undefined}
      <div class="flex items-center gap-3 rounded-lg border border-border px-4 py-4">
        <Spinner size="small" />
        <span class="text-sm text-muted-foreground"><Label label={importString('ConnectWaiting')} params={{ source: chosen.name }} /></span>
      </div>
    {:else}
      <p class="text-sm text-destructive">
        <Label
          label={connectError instanceof ConnectFailure ? CONNECT_FAILURES[connectError.reason] : importString('ConnectError')}
          params={{ source: chosen.name, error: connectError.message }}
        />
      </p>
      <div class="flex flex-wrap gap-2">
        <UiButton
          size="sm"
          onclick={() => {
            connect(chosen, connector)
          }}
        >
          <Plug /><Label label={importString('ConnectAgain')} />
        </UiButton>
        {#if chosen.file !== undefined}
          <UiButton
            variant="outline"
            size="sm"
            onclick={() => {
              chooseFile(chosen)
            }}
          >
            <Label label={importString('UploadInstead')} />
          </UiButton>
        {/if}
      </div>
    {/if}
  </section>
{:else if (step === 'choose' || step === 'fetching') && source !== undefined && activeConnector !== undefined && api !== undefined}
  {@const chosen = source}
  {@const connector = activeConnector}
  {@const callApi = api}
  <section class="mt-6 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <span class="text-sm font-medium text-foreground"><Label label={importString('ChooseFrom')} params={{ source: chosen.name }} /></span>
      <UiButton variant="ghost" size="sm" onclick={startOver}><Label label={importString('ChangeSource')} /></UiButton>
    </div>
    {#if step === 'fetching'}
      <div class="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
        <Spinner size="small" />
        <span class="min-w-0 flex-1 truncate text-sm text-foreground">
          {#if fetchProgress === undefined}
            <Label label={importString('Fetching')} params={{ source: chosen.name }} />
          {:else}
            {chosen.name} · {fetchProgress.label} ·
            <span class="tabular-nums text-muted-foreground"><Label label={AREA_COUNT[chosen.area]} params={{ count: fetchProgress.count }} /></span>
          {/if}
        </span>
        <UiButton
          variant="outline"
          size="sm"
          onclick={() => {
            fetchController?.abort()
          }}
        >
          <Square /><Label label={importString('Stop')} />
        </UiButton>
      </div>
      <span class="text-xs text-muted-foreground"><Label label={importString('KeepOpenFetch')} /></span>
    {:else if scopeError !== undefined}
      {@const isLost = isAccessLost(scopeError)}
      <p class="text-sm text-destructive">
        <Label
          label={isLost ? importString('AccessLost') : importString('ScopesFailed')}
          params={{ source: chosen.name, error: scopeError.message }}
        />
      </p>
      <div class="flex gap-2">
        <UiButton
          size="sm"
          onclick={() => {
            if (isLost) connect(chosen, connector)
            else void loadScopes(connector, callApi)
          }}
        >
          <Label label={isLost ? importString('ConnectAgain') : importString('TryAgain')} />
        </UiButton>
      </div>
    {:else if scopes === undefined}
      <Loading size="small" />
    {:else if scopes.length === 0}
      <p class="text-sm text-muted-foreground"><Label label={importString('NoScopes')} params={{ source: chosen.name }} /></p>
    {:else}
      {@const listed = scopes}
      {#if fetchError !== undefined}
        {@const isLost = isAccessLost(fetchError)}
        <p class="text-sm text-destructive">
          <Label
            label={isLost ? importString('AccessLost') : importString('FetchFailed')}
            params={{ source: chosen.name, error: fetchError.message }}
          />
        </p>
        {#if isLost}
          <div class="flex gap-2">
            <UiButton
              size="sm"
              onclick={() => {
                connect(chosen, connector)
              }}
            >
              <Plug /><Label label={importString('ConnectAgain')} />
            </UiButton>
          </div>
        {/if}
      {:else if emptyWarnings !== undefined}
        <p class="text-sm text-destructive"><Label label={importString('FetchEmpty')} params={{ source: chosen.name }} /></p>
        {#if emptyWarnings.length > 0}
          <ul class="list-disc pl-5 text-sm text-muted-foreground">
            {#each emptyWarnings as warning}<li>{warning}</li>{/each}
          </ul>
        {/if}
      {/if}
      <ScopePicker scopes={listed} bind:selected={selectedScopes} />
      <div class="mt-3 flex items-center justify-end gap-4 border-t border-border pt-6">
        <UiButton
          disabled={selectedScopes.size === 0}
          onclick={() => {
            void fetchSelected(
              connector,
              callApi,
              listed.filter((scope) => selectedScopes.has(scope.id)).map((scope) => scope.id)
            )
          }}
        >
          <Label label={importString('Fetch')} params={{ count: selectedScopes.size, source: chosen.name }} />
        </UiButton>
      </div>
    {/if}
  </section>
{:else if step === 'review' && selection !== undefined}
  {@const chosen = selection}
  <section class="mt-6 flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <span class="truncate text-sm font-medium text-foreground">{mode === 'connect' ? source?.name ?? '' : fileName}</span>
      <UiButton
        variant="ghost"
        size="sm"
        onclick={() => {
          step = mode === 'connect' ? 'choose' : 'file'
        }}
      >
        <Label label={mode === 'connect' ? importString('ChangeSelection') : importString('ChooseAnother')} />
      </UiButton>
    </div>
    {#each unitGroups as group}
      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-muted-foreground"><Label label={group.label} /></span>
        <ul class="divide-y divide-border rounded-lg border border-border">
          {#each group.units as unit (unit.key)}
            <li>
              <label class="flex cursor-pointer items-center gap-3 px-3 py-2">
                <Checkbox
                  checked={!excluded.has(unit.key)}
                  onCheckedChange={(checked) => {
                    setIncluded(unit.key, checked)
                  }}
                />
                <span class="min-w-0 flex-1 truncate text-sm text-foreground">{unit.name}</span>
                <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
                  <Label label={unit.countLabel} params={{ count: unit.count }} />
                </span>
              </label>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </section>

  {#if chosen.warnings.length > 0}
    <section class="mt-6 flex flex-col gap-2">
      <span class="text-sm font-medium text-foreground"><Label label={importString('Warnings')} /></span>
      <ul class="list-disc pl-5 text-sm text-muted-foreground">
        {#each chosen.warnings as warning}<li>{warning}</li>{/each}
      </ul>
    </section>
  {/if}

  {#if people.length > 0}
    <section class="mt-6 flex flex-col gap-2 border-t border-border pt-6">
      <div class="flex items-center justify-between gap-4">
        <span class="text-sm font-medium text-foreground"><Label label={importString('People')} /></span>
        {#if canInvite}
          <UiButton
            variant="outline"
            size="sm"
            onclick={() => {
              showPopup(login.component.InviteLink, {})
            }}
          >
            <Label label={importString('Invite')} />
          </UiButton>
        {/if}
      </div>
      <p class="text-sm text-muted-foreground"><Label label={importString('PeopleNote')} /></p>
      {#if matchError !== ''}
        <p class="text-sm text-destructive"><Label label={importString('MatchFailed')} params={{ error: matchError }} /></p>
      {:else if matches === undefined}
        <Loading size="small" />
      {:else}
        {@const matched = matches}
        {#if joining.length > 0}
          <label class="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="text-sm text-foreground">
                <Label label={canInvite ? importString('AddPeopleInvite') : importString('AddPeople')} params={{ count: joining.length }} />
              </span>
              <span class="text-xs text-muted-foreground"><Label label={importString('AddPeopleNote')} /></span>
            </span>
            <Switch
              checked={isAddingPeople}
              onCheckedChange={(isOn) => {
                isAddingPeople = isOn
              }}
            />
          </label>
        {/if}
        <ul class="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {#each people as person, index}
            {@const member = matched[index]}
            {@const isJoining = member === null && isAddingPeople && joiningEmails.has(person.email?.trim().toLowerCase() ?? '')}
            <li class="flex items-center justify-between gap-4 px-3 py-2">
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-sm text-foreground">{person.name ?? person.email}</span>
                {#if person.name !== undefined && person.email !== undefined}
                  <span class="truncate text-xs text-muted-foreground">{person.email}</span>
                {/if}
              </span>
              {#if member !== null}
                <span class="flex shrink-0 items-center gap-1.5 text-xs text-foreground"><Check class="size-3.5 text-primary" />{member}</span>
              {:else if isJoining}
                <span class="max-w-[50%] text-right text-xs text-foreground">
                  <Label label={canInvite ? importString('WillInvite') : importString('WillAdd')} />
                </span>
              {:else}
                <span class="max-w-[50%] text-right text-xs text-muted-foreground"><Label label={importString('NotMember')} /></span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <div class="mt-6 flex items-center justify-between gap-4 border-t border-border pt-6">
    <span class="text-xs text-muted-foreground">
      <Label label={mode === 'connect' ? importString('RunsOnceConnected') : importString('RunsOnce')} />
    </span>
    <UiButton
      disabled={selectedCount === 0}
      onclick={() => {
        void start(chosen, isAddingPeople ? joining : [])
      }}
    >
      <Label label={importString('Start')} params={{ count: selectedCount }} />
    </UiButton>
  </div>
{:else if step === 'running'}
  <section class="mt-6 flex flex-col gap-2">
    {#if running === undefined}
      <Loading size="small" />
    {:else}
      <div class="flex items-center justify-between gap-4 text-sm">
        <span class="truncate text-foreground">
          {#if peopleProgress !== undefined}
            <Label label={importString('AddingPeople')} />
          {:else if progress !== undefined}
            <Label label={importString('Importing')} params={{ unit: progress.unit }} />
          {/if}
        </span>
        <span class="shrink-0 tabular-nums text-muted-foreground">
          <Label label={importString('Progress')} params={{ done: running.done, total: running.total }} />
        </span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-muted">
        <div class="h-full rounded-full bg-primary transition-[width] duration-300" style:width="{percent}%"></div>
      </div>
    {/if}
    <span class="text-xs text-muted-foreground"><Label label={importString('KeepOpen')} /></span>
  </section>
{:else if step === 'failed' && failure !== undefined}
  {@const imported = countRows(failure.imported)}
  <section class="mt-6 flex flex-col gap-3">
    <div class="rounded-lg border border-destructive/40 px-4 py-3">
      <div class="text-sm font-medium text-destructive"><Label label={importString('Failed')} params={{ unit: failure.unit }} /></div>
      <p class="mt-1 break-words text-sm text-muted-foreground">{failure.reason.message}</p>
    </div>
    {#if imported.length === 0}
      <p class="text-sm text-muted-foreground"><Label label={importString('NothingImported')} /></p>
    {:else}
      <p class="text-sm text-muted-foreground"><Label label={importString('FailedNote')} params={{ unit: failure.unit }} /></p>
      <ul class="flex flex-col gap-1 text-sm text-foreground">
        {#each imported as [label, count]}<li><Label {label} params={{ count }} /></li>{/each}
      </ul>
    {/if}
    {#if notAdded.length > 0}
      <p class="text-sm text-destructive"><Label label={importString('NotAdded')} params={{ count: notAdded.length }} /></p>
      <ul class="list-disc pl-5 text-sm text-muted-foreground">
        {#each notAdded as missing}<li>{missing.email}: {missing.error}</li>{/each}
      </ul>
    {/if}
    <div class="flex gap-2">
      <UiButton
        variant="outline"
        size="sm"
        onclick={() => {
          step = 'review'
        }}
      >
        <Label label={importString('BackToReview')} />
      </UiButton>
    </div>
  </section>
{:else if step === 'done' && counts !== undefined}
  <section class="mt-6 flex flex-col gap-3">
    <span class="flex items-center gap-2 text-sm font-medium text-foreground">
      <Check class="size-4 text-primary" /><Label label={importString('Done')} />
    </span>
    <ul class="flex flex-col gap-1 text-sm text-muted-foreground">
      {#each countRows(counts) as [label, count]}<li><Label {label} params={{ count }} /></li>{/each}
    </ul>
    {#if notAdded.length > 0}
      <p class="text-sm text-destructive"><Label label={importString('NotAdded')} params={{ count: notAdded.length }} /></p>
      <ul class="list-disc pl-5 text-sm text-muted-foreground">
        {#each notAdded as missing}<li>{missing.email}: {missing.error}</li>{/each}
      </ul>
    {/if}
    <div class="flex flex-wrap gap-2">
      {#if counts.projects > 0}
        <UiButton variant="outline" size="sm" onclick={() => { openApp('tracker') }}><Label label={importString('OpenTracker')} /></UiButton>
      {/if}
      {#if counts.channels > 0}
        <UiButton variant="outline" size="sm" onclick={() => { openApp('chunter') }}><Label label={importString('OpenChat')} /></UiButton>
      {/if}
      {#if counts.teamspaces > 0}
        <UiButton variant="outline" size="sm" onclick={() => { openApp('document') }}><Label label={importString('OpenDocuments')} /></UiButton>
      {/if}
      <UiButton variant="ghost" size="sm" onclick={startOver}>
        <Label label={mode === 'connect' ? importString('AnotherSource') : importString('Another')} />
      </UiButton>
    </div>
  </section>
{/if}
