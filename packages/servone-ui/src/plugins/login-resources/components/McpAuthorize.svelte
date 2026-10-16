<!--
  OAuth consent for MCP clients (services/servone/src/mcp/oauth). The service's /oauth/authorize
  redirects here with ?request=<id>; Allow mints an API token and hands it to the service.
-->
<script lang="ts">
  import { isActiveMode, type WorkspaceInfoWithStatus } from '@hcengineering/core'
  import platform, {
    OK,
    PlatformError,
    Severity,
    Status,
    getMetadata,
    unknownError,
    type IntlString
  } from '@hcengineering/platform'
  import presentation from '@hcengineering/presentation'
  import { Label, getCurrentLocation } from '@hcengineering/ui'
  import { LoaderCircle } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { Button as UiButton } from '../../../lib/components/ui/button'
  import { servoneServiceUrl } from '../../chunter-resources/webhooks/api'
  import { getAccount, getAccountClient, goTo, selectWorkspace } from '../utils'
  import StatusControl from './StatusControl.svelte'

  const TITLE = 'login:string:ServoneMcpTitle' as IntlString
  const INTRO = 'login:string:ServoneMcpIntro' as IntlString
  const REDIRECT = 'login:string:ServoneMcpRedirect' as IntlString
  const WORKSPACE = 'login:string:ServoneMcpWorkspace' as IntlString
  const ALLOW = 'login:string:ServoneMcpAllow' as IntlString
  const DENY = 'login:string:ServoneMcpDeny' as IntlString
  const EXPIRED = 'login:string:ServoneMcpExpired' as IntlString
  const NOT_CONFIGURED = 'login:string:ServoneMcpNotConfigured' as IntlString
  const NO_WORKSPACES = 'login:string:ServoneMcpNoWorkspaces' as IntlString
  const TOO_MANY_TOKENS = 'login:string:ServoneMcpTooManyTokens' as IntlString
  const REQUEST_FAILED = 'login:string:ServoneMcpRequestFailed' as IntlString
  const SIGN_IN_CHECK_FAILED = 'login:string:ServoneMcpSignInCheckFailed' as IntlString

  const PENDING_REQUEST_KEY = 'servone.mcpAuthorize.request'
  const OAUTH_TOKEN_DAYS = 90
  const TOKEN_NAME_SUFFIX = ' (MCP)'
  const MAX_TOKEN_NAME_LEN = 255 // createApiToken in server/account rejects longer names with BadRequest

  type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

  interface AuthRequest {
    clientName: string
    redirectHost: string
  }

  type Phase = 'loading' | 'notConfigured' | 'expired' | 'noWorkspaces' | 'failed' | 'ready' | 'redirecting'

  let phase: Phase = 'loading'
  let status: Status = OK
  let isBusy = false
  let mcpUrl = ''
  let requestId = ''
  let authRequest: AuthRequest = { clientName: '', redirectHost: '' }
  let accountToken = ''
  let workspaces: WorkspaceInfoWithStatus[] = []
  let selectedUuid: string | undefined

  function isJsonObject (json: Json): json is { [key: string]: Json } {
    return json !== null && typeof json === 'object' && !Array.isArray(json)
  }

  function parseAuthRequest (json: Json): AuthRequest {
    if (isJsonObject(json) && typeof json.clientName === 'string' && typeof json.redirectHost === 'string') {
      return { clientName: json.clientName, redirectHost: json.redirectHost }
    }
    throw new Error('Malformed authorization request')
  }

  function parseRedirectTo (json: Json): string {
    if (isJsonObject(json) && typeof json.redirectTo === 'string') return json.redirectTo
    throw new Error('Malformed redirect response')
  }

  function requestUrl (action?: 'approve' | 'deny'): string {
    const base = `${mcpUrl}/oauth/requests/${encodeURIComponent(requestId)}`
    return action === undefined ? base : `${base}/${action}`
  }

  function httpFailure (response: Response): Status {
    return new Status(Severity.ERROR, REQUEST_FAILED, { status: response.status })
  }

  function tokenName (clientName: string): string {
    return clientName.slice(0, MAX_TOKEN_NAME_LEN - TOKEN_NAME_SUFFIX.length) + TOKEN_NAME_SUFFIX
  }

  async function load (): Promise<void> {
    requestId = getCurrentLocation().query?.request ?? ''
    if (requestId === '') {
      phase = 'expired'
      return
    }
    const serviceUrl = await servoneServiceUrl('SERVONE_MCP_URL')
    if (serviceUrl === undefined) {
      phase = 'notConfigured'
      return
    }
    mcpUrl = serviceUrl

    const response = await fetch(requestUrl())
    if (response.status === 404) {
      phase = 'expired'
      return
    }
    if (!response.ok) {
      status = httpFailure(response)
      phase = 'failed'
      return
    }
    authRequest = parseAuthRequest((await response.json()) as Json)

    const loginInfo = await getAccount(false)
    if (loginInfo?.token == null) {
      if (getMetadata(presentation.metadata.Token) != null) {
        status = new Status(Severity.ERROR, SIGN_IN_CHECK_FAILED, {})
        phase = 'failed'
        return
      }
      sessionStorage.setItem(PENDING_REQUEST_KEY, requestId)
      goTo('login', true)
      return
    }
    accountToken = loginInfo.token

    workspaces = (await getAccountClient(accountToken).getUserWorkspaces()).filter((ws) => isActiveMode(ws.mode))
    if (workspaces.length === 0) {
      phase = 'noWorkspaces'
      return
    }
    if (workspaces.length === 1) selectedUuid = workspaces[0].uuid
    phase = 'ready'
  }

  onMount(() => {
    load().catch((err: Error) => {
      status = unknownError(err)
      phase = 'failed'
    })
  })

  async function finish (response: Response): Promise<void> {
    if (response.status === 404) {
      phase = 'expired'
      return
    }
    if (!response.ok) {
      status = httpFailure(response)
      return
    }
    const redirectTo = parseRedirectTo((await response.json()) as Json)
    phase = 'redirecting'
    window.location.assign(redirectTo)
  }

  async function createToken (workspaceToken: string, workspace: WorkspaceInfoWithStatus): Promise<string | undefined> {
    try {
      const created = await getAccountClient(workspaceToken).createApiToken(
        tokenName(authRequest.clientName),
        workspace.uuid,
        OAUTH_TOKEN_DAYS
      )
      return created.token
    } catch (err) {
      if (!(err instanceof PlatformError)) throw err
      status =
        err.status.code === platform.status.BadRequest ? new Status(Severity.ERROR, TOO_MANY_TOKENS, {}) : err.status
      return undefined
    }
  }

  async function allow (): Promise<void> {
    const workspace = workspaces.find((ws) => ws.uuid === selectedUuid)
    if (workspace === undefined) return
    const [selectStatus, workspaceLogin] = await selectWorkspace(workspace.url, accountToken)
    if (workspaceLogin == null) {
      status = selectStatus
      return
    }
    const apiToken = await createToken(workspaceLogin.token, workspace)
    if (apiToken === undefined) return
    const response = await fetch(requestUrl('approve'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}` }
    })
    await finish(response)
  }

  async function deny (): Promise<void> {
    await finish(await fetch(requestUrl('deny'), { method: 'POST' }))
  }

  function run (action: () => Promise<void>): void {
    if (isBusy) return
    isBusy = true
    status = OK
    action()
      .catch((err: Error) => {
        status = unknownError(err)
      })
      .finally(() => {
        isBusy = false
      })
  }
</script>

<div class="flex flex-col gap-6">
  {#if phase === 'loading'}
    <div class="flex justify-center text-muted-foreground">
      <LoaderCircle class="animate-spin" />
    </div>
  {:else if phase === 'notConfigured'}
    <p class="text-sm text-muted-foreground"><Label label={NOT_CONFIGURED} /></p>
  {:else if phase === 'expired'}
    <p class="text-sm text-muted-foreground"><Label label={EXPIRED} /></p>
  {:else if phase === 'failed'}
    <StatusControl {status} />
  {:else}
    <div class="flex flex-col gap-1.5">
      <h1 class="text-lg font-semibold leading-none tracking-tight">
        <Label label={TITLE} params={{ client: authRequest.clientName }} />
      </h1>
      <p class="text-sm text-muted-foreground">
        <Label label={INTRO} params={{ client: authRequest.clientName }} />
      </p>
      <p class="text-xs text-muted-foreground">
        <Label label={REDIRECT} params={{ host: authRequest.redirectHost }} />
      </p>
    </div>

    {#if phase === 'noWorkspaces'}
      <p class="text-sm text-muted-foreground"><Label label={NO_WORKSPACES} /></p>
    {:else}
      <fieldset class="flex flex-col gap-2" disabled={isBusy || phase === 'redirecting'}>
        <legend class="mb-2 text-sm font-medium"><Label label={WORKSPACE} /></legend>
        {#each workspaces as workspace (workspace.uuid)}
          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary"
          >
            <input type="radio" name="workspace" value={workspace.uuid} bind:group={selectedUuid} />
            <span class="truncate">{workspace.name}</span>
          </label>
        {/each}
      </fieldset>
    {/if}

    {#if status.severity !== Severity.OK}
      <StatusControl {status} />
    {/if}

    <div class="flex flex-col gap-3">
      {#if phase !== 'noWorkspaces'}
        <UiButton
          type="button"
          class="w-full"
          disabled={isBusy || phase === 'redirecting' || selectedUuid === undefined}
          onclick={() => {
            run(allow)
          }}
        >
          {#if isBusy}
            <LoaderCircle class="animate-spin" />
          {/if}
          <Label label={ALLOW} />
        </UiButton>
      {/if}
      <UiButton
        type="button"
        variant="outline"
        class="w-full"
        disabled={isBusy || phase === 'redirecting'}
        onclick={() => {
          run(deny)
        }}
      >
        <Label label={DENY} />
      </UiButton>
    </div>
  {/if}
</div>
