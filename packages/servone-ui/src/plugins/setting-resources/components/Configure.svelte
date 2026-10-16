<script lang="ts">
  import { type PluginConfiguration } from '@hcengineering/core'
  import { type Asset, type IntlString } from '@hcengineering/platform'
  import { getClient, isDisabled, pluginConfigurationChanged, pluginConfigurationStore } from '@hcengineering/presentation'
  import { Breadcrumb, Header, Icon, IconInfo, Label, Scroller } from '@hcengineering/ui'
  import { RotateCw } from '@lucide/svelte'
  import setting from '../plugin'
  import { Badge } from '../../../lib/components/ui/badge'
  import { Button } from '../../../lib/components/ui/button'
  import { Card, CardContent } from '../../../lib/components/ui/card'
  import { Switch } from '../../../lib/components/ui/switch'

  const SHIPPED_MODULE_IDS = ['calendar', 'chat', 'document', 'drive', 'love', 'tracker']
  const CHAT_FALLBACK_ICON: Asset = 'chat:icon:ChatBubble' as Asset
  const VIDEO_CALLS_DESCRIPTION = 'setting:string:ServoneVideoCallsDescription' as IntlString
  const INTRO = 'setting:string:ServoneModulesIntro' as IntlString
  const reloadHintLabel = 'setting:string:ServoneModulesReloadHint' as IntlString
  const reloadButtonLabel = 'setting:string:ServoneReload' as IntlString

  function isShownModule (configuration: PluginConfiguration): boolean {
    if (!SHIPPED_MODULE_IDS.includes(configuration.pluginId)) return false
    if (configuration.system === true) return false
    if (isDisabled(configuration.pluginId)) return false
    return configuration.hidden !== true || configuration.pluginId === 'chat'
  }

  function pickIcon (configuration: PluginConfiguration): Asset | typeof IconInfo {
    if (configuration.icon !== undefined) return configuration.icon
    return configuration.pluginId === 'chat' ? CHAT_FALLBACK_ICON : IconInfo
  }

  async function saveEnabled (configuration: PluginConfiguration, isEnabled: boolean): Promise<void> {
    await getClient().update(configuration, { enabled: isEnabled })
  }

  $: shownConfigurations = $pluginConfigurationStore.list.filter(isShownModule)
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={setting.icon.Setting} label={setting.string.Configuration} size={'large'} isCurrent />
  </Header>
  <div class="hulyComponent-content__column content">
    <Scroller align={'center'} padding={'var(--spacing-3)'} bottomPadding={'var(--spacing-3)'}>
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <div class="flex flex-col gap-1">
          <h2 class="text-lg font-semibold text-foreground"><Label label={setting.string.Configuration} /></h2>
          <p class="text-sm text-muted-foreground"><Label label={INTRO} /></p>
        </div>

        {#if $pluginConfigurationChanged}
          <div
            role="status"
            class="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm"
          >
            <span class="min-w-0 flex-1 text-muted-foreground"><Label label={reloadHintLabel} /></span>
            <Button size="sm" onclick={() => window.location.reload()}>
              <RotateCw data-icon="inline-start" />
              <Label label={reloadButtonLabel} />
            </Button>
          </div>
        {/if}

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {#each shownConfigurations as configuration (configuration._id)}
            <Card size="sm">
              <CardContent class="flex flex-col gap-2">
                <div class="flex items-center gap-3">
                  <span class="text-muted-foreground">
                    <Icon icon={pickIcon(configuration)} size={'medium'} />
                  </span>
                  <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    <Label label={configuration.label} />
                  </span>
                  {#if configuration.beta}
                    <Badge variant="secondary">Beta</Badge>
                  {/if}
                  <Switch
                    checked={configuration.enabled ?? true}
                    onCheckedChange={(isEnabled) => saveEnabled(configuration, isEnabled)}
                  />
                </div>
                {#if configuration.pluginId === 'love'}
                  <p class="text-xs text-muted-foreground"><Label label={VIDEO_CALLS_DESCRIPTION} /></p>
                {:else if configuration.description !== undefined}
                  <p class="text-xs text-muted-foreground"><Label label={configuration.description} /></p>
                {/if}
              </CardContent>
            </Card>
          {/each}
        </div>
      </div>
    </Scroller>
  </div>
</div>
