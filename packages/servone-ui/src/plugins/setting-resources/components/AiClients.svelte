<!-- Settings > AI clients: how to point an MCP client (services/servone/src/mcp) at this workspace. -->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import presentation, { copyTextToClipboard, getCurrentWorkspaceUuid } from '@hcengineering/presentation'
  import { Breadcrumb, Header, IconLink, Label, Loading, Scroller } from '@hcengineering/ui'
  import { onMount } from 'svelte'
  import { Button as UiButton } from '../../../lib/components/ui/button'
  import { servoneServiceUrl } from '../../chunter-resources/webhooks/api'
  import { getAccountClient } from '../utils'

  const AI_CLIENTS = 'setting:string:ServoneAiClients' as IntlString
  const INTRO = 'setting:string:ServoneAiClientsIntro' as IntlString
  const NOT_CONFIGURED = 'setting:string:ServoneAiClientsNotConfigured' as IntlString
  const SERVER_URL = 'setting:string:ServoneAiClientsServerUrl' as IntlString
  const CONNECTOR_TITLE = 'setting:string:ServoneAiClientsConnectorTitle' as IntlString
  const CONNECTOR_STEPS = 'setting:string:ServoneAiClientsConnectorSteps' as IntlString
  const CLAUDE_CODE = 'setting:string:ServoneAiClientsClaudeCode' as IntlString
  const CLAUDE_CODE_STEPS = 'setting:string:ServoneAiClientsClaudeCodeSteps' as IntlString
  const TOKEN_TITLE = 'setting:string:ServoneAiClientsTokenTitle' as IntlString
  const TOKEN_STEPS = 'setting:string:ServoneAiClientsTokenSteps' as IntlString
  const CREATE_TOKEN = 'setting:string:ServoneAiClientsCreateToken' as IntlString
  const TOKEN_CREATED = 'setting:string:ServoneAiClientsTokenCreated' as IntlString
  const TOKEN_FAILED = 'setting:string:ServoneAiClientsTokenFailed' as IntlString
  const JSON_CONFIG = 'setting:string:ServoneAiClientsJsonConfig' as IntlString
  const TOKEN_PLACEHOLDER = '<token>'
  const TOKEN_NAME = 'AI client (MCP)'
  const TOKEN_DAYS = 90

  let serviceUrl: string | undefined | null = null
  let hasOAuth = false
  let createdToken: string | undefined
  let isCreating = false
  let hasCreateFailed = false

  $: mcpUrl = serviceUrl != null ? `${serviceUrl}/mcp` : ''
  $: bearer = `Bearer ${createdToken ?? TOKEN_PLACEHOLDER}`
  $: claudeCodeCommand = `claude mcp add --transport http servone ${mcpUrl}`
  $: jsonConfig = JSON.stringify(
    { mcpServers: { servone: { type: 'http', url: mcpUrl, headers: { Authorization: bearer } } } },
    null,
    2
  )

  async function detectOAuth (base: string): Promise<boolean> {
    return await fetch(`${base}/.well-known/oauth-authorization-server`).then(
      (response) => response.ok,
      () => false
    )
  }

  onMount(async () => {
    serviceUrl = await servoneServiceUrl('SERVONE_MCP_URL')
    if (serviceUrl !== undefined) hasOAuth = await detectOAuth(serviceUrl)
  })

  async function createToken (): Promise<void> {
    isCreating = true
    hasCreateFailed = false
    try {
      const created = await getAccountClient().createApiToken(TOKEN_NAME, getCurrentWorkspaceUuid(), TOKEN_DAYS)
      createdToken = created.token
    } catch (error) {
      hasCreateFailed = true
      throw error
    } finally {
      isCreating = false
    }
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={IconLink} label={AI_CLIENTS} size={'large'} isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-2xl flex-col px-6 py-6">
      {#if serviceUrl === null}
        <Loading size="small" />
      {:else if serviceUrl === undefined}
        <span class="text-sm text-muted-foreground"><Label label={NOT_CONFIGURED} /></span>
      {:else}
        <p class="text-sm text-muted-foreground"><Label label={INTRO} /></p>

        <section class="mt-6 flex flex-col gap-2">
          <div class="text-sm font-medium text-foreground"><Label label={SERVER_URL} /></div>
          <div class="flex items-center gap-2">
            <code class="snippet flex-grow">{mcpUrl}</code>
            <UiButton variant="outline" size="sm" onclick={() => {
                void copyTextToClipboard(mcpUrl)
              }}><Label label={presentation.string.Copy} /></UiButton>
          </div>
        </section>

        {#if hasOAuth}
          <section class="mt-6 flex flex-col gap-2 border-t border-border pt-6">
            <div class="text-sm font-medium text-foreground"><Label label={CONNECTOR_TITLE} /></div>
            <span class="text-sm text-muted-foreground"><Label label={CONNECTOR_STEPS} /></span>
          </section>

          <section class="mt-6 flex flex-col gap-2 border-t border-border pt-6">
            <div class="flex items-center justify-between gap-4">
              <span class="text-sm font-medium text-foreground"><Label label={CLAUDE_CODE} /></span>
              <UiButton variant="outline" size="sm" onclick={() => {
                  void copyTextToClipboard(claudeCodeCommand)
                }}><Label label={presentation.string.Copy} /></UiButton>
            </div>
            <pre class="snippet">{claudeCodeCommand}</pre>
            <span class="text-sm text-muted-foreground"><Label label={CLAUDE_CODE_STEPS} /></span>
          </section>
        {/if}

        <section class="mt-6 flex flex-col gap-3 border-t border-border pt-6">
          <div class="text-sm font-medium text-foreground"><Label label={TOKEN_TITLE} /></div>
          <span class="text-sm text-muted-foreground"><Label label={TOKEN_STEPS} /></span>
          {#if createdToken === undefined}
            <div>
              <UiButton size="sm" disabled={isCreating} onclick={createToken}><Label label={CREATE_TOKEN} /></UiButton>
            </div>
            {#if hasCreateFailed}
              <span class="text-sm text-destructive"><Label label={TOKEN_FAILED} /></span>
            {/if}
          {:else}
            <span class="text-sm text-foreground"><Label label={TOKEN_CREATED} /></span>
            <div class="flex items-center gap-2">
              <code class="snippet flex-grow">{createdToken}</code>
              <UiButton variant="outline" size="sm" onclick={() => {
                  if (createdToken !== undefined) void copyTextToClipboard(createdToken)
                }}><Label label={presentation.string.Copy} /></UiButton>
            </div>
          {/if}
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-4">
              <span class="text-sm text-foreground"><Label label={JSON_CONFIG} /></span>
              <UiButton variant="outline" size="sm" onclick={() => {
                  void copyTextToClipboard(jsonConfig)
                }}><Label label={presentation.string.Copy} /></UiButton>
            </div>
            <pre class="snippet">{jsonConfig}</pre>
          </div>
        </section>
      {/if}
    </div>
  </Scroller>
</div>

<style lang="scss">
  .snippet {
    margin: 0;
    padding: 0.5rem;
    border-radius: 0.25rem;
    background-color: var(--theme-button-default);
    font-size: 0.8125rem;
    white-space: pre-wrap;
    word-break: break-all;
    user-select: all;
  }
</style>
