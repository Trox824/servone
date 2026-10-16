<script lang="ts">
  import core, { getCurrentAccount } from '@hcengineering/core'
  import type { DevicesPreference } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import { Breadcrumb, Header, Label, Scroller, Toggle } from '@hcengineering/ui'
  import love from '../plugin'
  import { myPreferences } from '../stores'
  import { loadKrisp, setNoiseCancellation } from '../utils'

  type PreferenceField = 'micEnabled' | 'camEnabled' | 'noiseCancellation'

  const client = getClient()

  let isNoiseFilterSupported = false

  void loadKrisp().then((krisp) => {
    isNoiseFilterSupported = krisp.isKrispNoiseFilterSupported()
  })

  $: isMicEnabled = $myPreferences?.micEnabled ?? true
  $: isCamEnabled = $myPreferences?.camEnabled ?? true
  $: isNoiseCancellationOn = $myPreferences?.noiseCancellation ?? true

  async function savePreference (field: PreferenceField, newValue: boolean): Promise<void> {
    const existingPreference = $myPreferences
    if (existingPreference !== undefined) {
      await client.update(existingPreference, { [field]: newValue })
      return
    }
    const defaults: Pick<DevicesPreference, PreferenceField> = {
      micEnabled: true,
      camEnabled: true,
      noiseCancellation: true
    }
    defaults[field] = newValue
    await client.createDoc(love.class.DevicesPreference, core.space.Workspace, {
      attachedTo: getCurrentAccount().uuid,
      blurRadius: 0,
      ...defaults
    })
  }

  function onMutedMicChange (event: CustomEvent<boolean>): void {
    void savePreference('micEnabled', !event.detail)
  }

  function onWithoutVideoChange (event: CustomEvent<boolean>): void {
    void savePreference('camEnabled', !event.detail)
  }

  function onNoiseCancellationChange (event: CustomEvent<boolean>): void {
    const isOn = event.detail
    void savePreference('noiseCancellation', isOn).then(async () => {
      await setNoiseCancellation(isOn)
    })
  }
</script>

<div class="hulyComponent">
  <Header adaptive="disabled">
    <Breadcrumb icon={love.icon.Love} label={love.string.Office} size="large" isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div class="divide-y divide-border rounded-lg border border-border">
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <span class="text-sm text-foreground"><Label label={love.string.StartWithMutedMic} /></span>
          <Toggle on={!isMicEnabled} on:change={onMutedMicChange} />
        </div>
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <span class="text-sm text-foreground"><Label label={love.string.StartWithoutVideo} /></span>
          <Toggle on={!isCamEnabled} on:change={onWithoutVideoChange} />
        </div>
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <span class="text-sm text-foreground"><Label label={love.string.NoiseCancellation} /></span>
          <Toggle
            on={isNoiseFilterSupported && isNoiseCancellationOn}
            disabled={!isNoiseFilterSupported}
            showTooltip={isNoiseFilterSupported ? undefined : { label: love.string.NoiseCancellationNotSupported }}
            on:change={onNoiseCancellationChange}
          />
        </div>
      </div>
    </div>
  </Scroller>
</div>
