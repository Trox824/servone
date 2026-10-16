<script lang="ts">
  import { getClient } from '@hcengineering/presentation'
  import notification, { type NotificationProvider } from '@hcengineering/notification'
  import core, { type Ref } from '@hcengineering/core'
  import { getResource } from '@hcengineering/platform'
  import { providersSettings } from '../../utils'
  import ProviderPreferences from './ProviderPreferences.svelte'
  import WorkingHoursSetting from './WorkingHoursSetting.svelte'
  import EmailDigestSetting from './EmailDigestSetting.svelte'

  const client = getClient()

  const orderedProviders: NotificationProvider[] = client
    .getModel()
    .findAllSync(notification.class.NotificationProvider, {})
    .sort((first, second) => first.order - second.order)

  async function isProviderAvailable (provider: NotificationProvider): Promise<boolean> {
    if (provider.isAvailableFn === undefined) return true
    const checkAvailable = await getResource(provider.isAvailableFn)
    return checkAvailable()
  }

  function findStoredSetting (providerId: Ref<NotificationProvider>): (typeof $providersSettings)[number] | undefined {
    return $providersSettings.find((setting) => setting.attachedTo === providerId)
  }

  function isProviderOn (providerId: Ref<NotificationProvider>): boolean {
    const stored = findStoredSetting(providerId)
    if (stored !== undefined) return stored.enabled
    return orderedProviders.find((provider) => provider._id === providerId)?.defaultEnabled ?? false
  }

  async function writeProviderState (providerId: Ref<NotificationProvider>, enabled: boolean): Promise<void> {
    const stored = findStoredSetting(providerId)
    if (stored !== undefined) {
      await client.update(stored, { enabled })
      stored.enabled = enabled
      return
    }
    await client.createDoc(notification.class.NotificationProviderSetting, core.space.Workspace, {
      attachedTo: providerId,
      enabled
    })
  }

  async function toggleProvider (event: CustomEvent<NotificationProvider | undefined>): Promise<void> {
    const provider = event.detail
    if (provider === undefined) return
    const nextEnabled = !isProviderOn(provider._id)
    await writeProviderState(provider._id, nextEnabled)

    if (nextEnabled) {
      if (provider.depends !== undefined && !isProviderOn(provider.depends)) {
        await writeProviderState(provider.depends, true)
      }
      return
    }
    for (const dependent of orderedProviders.filter((other) => other.depends === provider._id)) {
      await writeProviderState(dependent._id, false)
    }
  }
</script>

<div class="flex flex-col gap-4">
  {#each orderedProviders as provider (provider._id)}
    {#await isProviderAvailable(provider) then isAvailable}
      {#if isAvailable}
        <ProviderPreferences {provider} on:toggle={toggleProvider} />
      {/if}
    {/await}
  {/each}
  <WorkingHoursSetting />
  <EmailDigestSetting />
</div>
