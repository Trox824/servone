<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { createQuery, getCurrentWorkspaceUuid } from '@hcengineering/presentation'
  import setting, { type IntegrationType, IntegrationError } from '@hcengineering/setting'
  import { type Integration } from '@hcengineering/account-client'
  import { type IntegrationKind } from '@hcengineering/core'
  import {
    Header,
    Breadcrumb,
    NotificationSeverity,
    addNotification,
    themeStore,
    type TabItem,
    Switcher,
    Loading
  } from '@hcengineering/ui'
  import { translate } from '@hcengineering/platform'
  import type { IntlString } from '@hcengineering/platform'
  import { onIntegrationEvent } from '@hcengineering/integration-client'
  import { Analytics } from '@hcengineering/analytics'
  import IntegrationCard from './IntegrationCard.svelte'
  import IntegrationErrorNotification from './IntegrationErrorNotification.svelte'
  import { getAccountClient } from '../../utils'

  type CardEntry = { kindDoc: IntegrationType, integration: Integration | undefined }

  const FALLBACK_REFRESH_INTERVAL_MS = 10_000
  const INTEGRATION_EVENT_NAMES = ['integration:updated', 'integration:created', 'integration:deleted']
  const MAIL_KIND = 'huly-mail' as IntegrationKind

  const modeTabs: TabItem[] = [
    { id: 'all', labelIntl: setting.string.AllIntegrations },
    { id: 'connected', labelIntl: setting.string.ConnectedIntegrations },
    { id: 'available', labelIntl: setting.string.AvailableIntegrations }
  ]

  const kindsQuery = createQuery()

  let integrationKinds: IntegrationType[] = []
  let accountConnections: Integration[] = []
  let workspaceIntegrations: Integration[] = []
  let selectedMode = 'all'
  let isLoading = true
  let lastActivityAt = Date.now()
  let pendingRefresh: Promise<void> | undefined
  let fallbackTimer: ReturnType<typeof setInterval> | undefined
  let eventUnsubscribers: Array<() => void> = []

  kindsQuery.query(setting.class.IntegrationType, { kind: { $ne: MAIL_KIND } }, (kinds) => {
    integrationKinds = kinds
  })

  $: cards = buildCards(selectedMode, integrationKinds, workspaceIntegrations, accountConnections)

  function buildCards (
    mode: string,
    kinds: IntegrationType[],
    ownIntegrations: Integration[],
    connections: Integration[]
  ): CardEntry[] {
    if (mode === 'available') {
      return kinds.map((kindDoc) => ({ kindDoc, integration: undefined }))
    }
    if (mode === 'connected') {
      const connectedCards: CardEntry[] = []
      for (const integration of ownIntegrations) {
        const kindDoc = kinds.find((candidate) => candidate.kind === integration.kind)
        if (kindDoc !== undefined) connectedCards.push({ kindDoc, integration })
      }
      return connectedCards
    }
    const allCards: CardEntry[] = []
    for (const kindDoc of kinds) {
      const ownOfKind = ownIntegrations.filter((integration) => integration.kind === kindDoc.kind)
      const usedSocialIds = new Set(ownOfKind.map((integration) => integration.socialId))
      const connectionsOfKind = connections.filter(
        (integration) => integration.kind === kindDoc.kind && !usedSocialIds.has(integration.socialId)
      )
      const kindCards: CardEntry[] = [...ownOfKind, ...connectionsOfKind].map((integration) => ({
        kindDoc,
        integration
      }))
      if (kindCards.length === 0 || kindDoc.allowMultiple === true) {
        kindCards.push({ kindDoc, integration: undefined })
      }
      allCards.push(...kindCards)
    }
    return allCards
  }

  function cardKey (card: CardEntry): string {
    const { integration, kindDoc } = card
    if (integration === undefined) return kindDoc._id
    return `${integration.kind}-${integration.socialId}-${integration.workspaceUuid}`
  }

  function selectMode (event: CustomEvent<TabItem | undefined>): void {
    if (event.detail === undefined) return
    selectedMode = event.detail.id
  }

  async function loadLists (): Promise<void> {
    const accountClient = getAccountClient()
    const [connections, ownIntegrations] = await Promise.all([
      accountClient.listIntegrations({ workspaceUuid: null }),
      accountClient.listIntegrations({ workspaceUuid: getCurrentWorkspaceUuid() })
    ])
    accountConnections = connections
    workspaceIntegrations = ownIntegrations
  }

  async function reloadLists (): Promise<void> {
    try {
      await loadLists()
      lastActivityAt = Date.now()
    } catch (err) {
      Analytics.handleError(err)
    }
  }

  function refresh (): Promise<void> {
    if (pendingRefresh !== undefined) return pendingRefresh
    pendingRefresh = reloadLists().finally(() => {
      pendingRefresh = undefined
    })
    return pendingRefresh
  }

  async function notifyError (titleId: IntlString, messageId: IntlString): Promise<void> {
    const language = $themeStore.language
    addNotification(
      await translate(titleId, {}, language),
      await translate(messageId, {}, language),
      IntegrationErrorNotification,
      undefined,
      NotificationSeverity.Error
    )
  }

  async function reportUrlError (): Promise<void> {
    const queryParams = new URLSearchParams(window.location.search)
    const reportedError = queryParams.get('integrationError')
    if (reportedError === null) return
    const decodedError = decodeURIComponent(reportedError)
    Analytics.handleError(new Error('Integration error: ' + decodedError))
    await notifyError(
      setting.string.IntegrationFailed,
      decodedError === IntegrationError.EMAIL_IS_ALREADY_USED
        ? setting.string.EmailIsUsed
        : setting.string.IntegrationError
    )
    queryParams.delete('integrationError')
    const remainingQuery = queryParams.toString()
    const cleanedUrl =
      window.location.pathname + (remainingQuery !== '' ? `?${remainingQuery}` : '') + window.location.hash
    history.replaceState({}, document.title, cleanedUrl)
  }

  onMount(async () => {
    try {
      await loadLists()
      await reportUrlError()
      lastActivityAt = Date.now()
      eventUnsubscribers = INTEGRATION_EVENT_NAMES.map((eventName) =>
        onIntegrationEvent(eventName, () => {
          lastActivityAt = Date.now()
          void refresh()
        })
      )
      fallbackTimer = setInterval(() => {
        if (Date.now() - lastActivityAt >= FALLBACK_REFRESH_INTERVAL_MS) {
          lastActivityAt = Date.now()
          void refresh()
        }
      }, FALLBACK_REFRESH_INTERVAL_MS)
    } catch (err) {
      Analytics.handleError(err)
      await notifyError(setting.string.FailedToLoadIntegrations, setting.string.IntegrationError)
      accountConnections = []
      workspaceIntegrations = []
    } finally {
      isLoading = false
    }
  })

  onDestroy(() => {
    eventUnsubscribers.forEach((unsubscribe) => {
      unsubscribe()
    })
    clearInterval(fallbackTimer)
  })
</script>

<div class="hulyComponent">
  <Header adaptive="disabled">
    <Breadcrumb icon={setting.icon.Integrations} label={setting.string.Integrations} size="large" isCurrent />
    <svelte:fragment slot="extra">
      <Switcher name="integrations-mode-view" kind="subtle" items={modeTabs} selected={selectedMode} on:select={selectMode} />
    </svelte:fragment>
  </Header>
  {#if isLoading}
    <div class="flex h-full w-full items-center justify-center">
      <Loading />
    </div>
  {:else}
    <div
      class="mx-auto grid w-full max-w-2xl auto-rows-[minmax(14.5rem,auto)] grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-6 overflow-auto p-6"
      transition:fade={{ duration: 300 }}
    >
      {#each cards as card (cardKey(card))}
        <IntegrationCard integrationType={card.kindDoc} integration={card.integration} />
      {/each}
      {#if cards.length === 1}
        <div></div>
      {/if}
    </div>
  {/if}
</div>
