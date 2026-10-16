<script lang="ts">
  import { type ApiTokenInfo } from '@hcengineering/account-client'
  import { Analytics } from '@hcengineering/analytics'
  import { type IntlString } from '@hcengineering/platform'
  import { MessageBox } from '@hcengineering/presentation'
  import setting from '@hcengineering/setting'
  import { themeStore } from '@hcengineering/theme'
  import { Breadcrumb, Header, Label, Loading, Scroller, showPopup } from '@hcengineering/ui'
  import { onMount } from 'svelte'
  import { getAccountClient } from '../utils'
  import ApiDocsSection from './ApiDocsSection.svelte'
  import ApiTokenCreatePopup from './ApiTokenCreatePopup.svelte'
  import { Badge, type BadgeVariant } from '../../../lib/components/ui/badge'
  import { Button } from '../../../lib/components/ui/button'
  import * as Empty from '../../../lib/components/ui/empty'
  import * as Table from '../../../lib/components/ui/table'

  type TokenStatus = 'active' | 'expiring' | 'revoked' | 'expired'

  const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
  const MCP_SUFFIX = ' (MCP)'
  const INTRO = 'setting:string:ServoneApiTokensIntro' as IntlString
  const EMPTY_HINT = 'setting:string:ServoneApiTokensEmptyHint' as IntlString
  const TRY_AGAIN = 'setting:string:ServoneTryAgain' as IntlString
  const REVOKE = 'setting:string:ServoneRevoke' as IntlString
  const COLUMNS = {
    name: 'setting:string:ServoneColumnName' as IntlString,
    workspace: 'setting:string:ServoneColumnWorkspace' as IntlString,
    created: 'setting:string:ServoneColumnCreated' as IntlString,
    expires: 'setting:string:ServoneColumnExpires' as IntlString,
    status: 'setting:string:ServoneColumnStatus' as IntlString,
    actions: 'setting:string:ServoneColumnActions' as IntlString
  }

  const statusBadgeVariant: Record<TokenStatus, BadgeVariant> = {
    active: 'success',
    expiring: 'warning',
    revoked: 'destructive',
    expired: 'destructive'
  }

  const statusLabel = {
    active: setting.string.ApiTokenStatusActive,
    expiring: setting.string.ApiTokenStatusExpiring,
    revoked: setting.string.ApiTokenStatusRevoked,
    expired: setting.string.ApiTokenStatusExpired
  }

  let tokenList: ApiTokenInfo[] = []
  let workspaceNameByUuid = new Map<string, string>()
  let isLoading = true
  let hasLoadFailed = false
  let hasRevokeFailed = false

  $: dateLocale = $themeStore.language ?? 'en'

  async function reloadTokens (): Promise<void> {
    isLoading = true
    hasLoadFailed = false
    try {
      const accountClient = getAccountClient()
      const [fetchedTokens, fetchedWorkspaces] = await Promise.all([
        accountClient.listApiTokens(),
        accountClient.getUserWorkspaces()
      ])
      tokenList = [...fetchedTokens].sort((first, second) => second.createdOn - first.createdOn)
      workspaceNameByUuid = new Map(fetchedWorkspaces.map((workspace) => [workspace.uuid, workspace.name]))
    } catch (error) {
      Analytics.handleError(error as Error)
      tokenList = []
      hasLoadFailed = true
    } finally {
      isLoading = false
    }
  }

  onMount(() => {
    void reloadTokens()
  })

  function openCreatePopup (): void {
    showPopup(ApiTokenCreatePopup, {}, 'top', (closeValue) => {
      if (closeValue === true) void reloadTokens()
    })
  }

  function confirmRevoke (token: ApiTokenInfo): void {
    showPopup(MessageBox, {
      label: setting.string.ApiTokenRevoke,
      message: setting.string.ApiTokenRevokeConfirm,
      dangerous: true,
      action: async () => {
        try {
          await getAccountClient().revokeApiToken(token.id)
          hasRevokeFailed = false
        } catch (error) {
          Analytics.handleError(error as Error)
          hasRevokeFailed = true
        }
        await reloadTokens()
      }
    })
  }

  function getStatus (token: ApiTokenInfo, now: number): TokenStatus {
    if (token.revoked) return 'revoked'
    if (token.expiresOn < now) return 'expired'
    if (token.expiresOn - now < EXPIRING_WINDOW_MS) return 'expiring'
    return 'active'
  }

  function formatDate (timestamp: number, locale: string): string {
    return new Date(timestamp).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function displayName (token: ApiTokenInfo): string {
    return token.name.endsWith(MCP_SUFFIX) ? token.name.slice(0, -MCP_SUFFIX.length) : token.name
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={setting.icon.ApiToken} label={setting.string.ApiTokens} size={'large'} isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div class="flex items-center justify-between gap-4">
        <span class="text-sm text-muted-foreground"><Label label={INTRO} /></span>
        <Button size="sm" disabled={isLoading} onclick={openCreatePopup}>
          <Label label={setting.string.CreateApiToken} />
        </Button>
      </div>

      {#if isLoading}
        <Loading />
      {:else if hasLoadFailed || hasRevokeFailed}
        <Empty.Empty class="border">
          <Empty.Header>
            <Empty.Title>
              <Label label={hasLoadFailed ? setting.string.ApiTokenLoadError : setting.string.ApiTokenRevokeError} />
            </Empty.Title>
          </Empty.Header>
          <Empty.Content>
            <Button variant="outline" size="sm" onclick={() => void reloadTokens()}><Label label={TRY_AGAIN} /></Button>
          </Empty.Content>
        </Empty.Empty>
      {:else if tokenList.length === 0}
        <Empty.Empty class="border">
          <Empty.Header>
            <Empty.Title><Label label={setting.string.ApiTokenNoTokens} /></Empty.Title>
          </Empty.Header>
          <Empty.Content>
            <p class="text-sm text-muted-foreground"><Label label={EMPTY_HINT} /></p>
          </Empty.Content>
        </Empty.Empty>
      {:else}
        <div class="api-tokens-table">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head><Label label={COLUMNS.name} /></Table.Head>
              <Table.Head><Label label={COLUMNS.workspace} /></Table.Head>
              <Table.Head><Label label={COLUMNS.created} /></Table.Head>
              <Table.Head><Label label={COLUMNS.expires} /></Table.Head>
              <Table.Head><Label label={COLUMNS.status} /></Table.Head>
              <Table.Head class="w-20"><span class="sr-only"><Label label={COLUMNS.actions} /></span></Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each tokenList as token (token.id)}
              {@const tokenStatus = getStatus(token, Date.now())}
              <Table.Row>
                <Table.Cell class="font-medium text-foreground">{displayName(token)}</Table.Cell>
                <Table.Cell class="text-muted-foreground">
                  {workspaceNameByUuid.get(token.workspaceUuid) ?? token.workspaceName}
                </Table.Cell>
                <Table.Cell class="text-muted-foreground">{formatDate(token.createdOn, dateLocale)}</Table.Cell>
                <Table.Cell class="text-muted-foreground">
                  {token.revoked ? '-' : formatDate(token.expiresOn, dateLocale)}
                </Table.Cell>
                <Table.Cell>
                  <Badge variant={statusBadgeVariant[tokenStatus]}>
                    <Label label={statusLabel[tokenStatus]} />
                  </Badge>
                </Table.Cell>
                <Table.Cell class="w-20 text-right">
                  {#if !token.revoked}
                    <Button variant="destructive" size="xs" onclick={() => confirmRevoke(token)}><Label label={REVOKE} /></Button>
                  {/if}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
        </div>
      {/if}

      <ApiDocsSection />
    </div>
  </Scroller>
</div>
