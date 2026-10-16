<!-- Email digest opt-in on the user's Push setting; services/servone/src/scheduler sends it. -->
<script lang="ts">
  import { translate } from '@hcengineering/platform'
  import { Label, ModernToggle, themeStore } from '@hcengineering/ui'
  import { DEFAULT_DIGEST_IDLE_HOURS, DIGEST_IDLE_HOURS, parseDigest, type DigestIdleHours, type DigestLocale } from '@servone/notify-rules'
  import {
    myPushSettingStore,
    setMentionEmails,
    startPushSettingQuery,
    updateMyPushSetting
  } from '../../../../lib/notify/push-setting'
  import { notifySettingsString } from '../../../../lib/notify/settings-string'

  startPushSettingQuery()

  $: digest = parseDigest($myPushSettingStore)
  $: isEnabled = digest?.isEnabled === true
  $: idleHours = digest?.idleHours ?? DEFAULT_DIGEST_IDLE_HOURS
  function digestLocale (language: string): DigestLocale {
    return language === 'vi' ? 'vi' : 'en'
  }

  $: locale = digestLocale($themeStore.language)

  let hourLabels = new Map<DigestIdleHours, string>()
  $: void loadHourLabels($themeStore.language)

  async function loadHourLabels (language: string): Promise<void> {
    const entries = await Promise.all(
      DIGEST_IDLE_HOURS.map(
        async (hours) => [hours, await translate(notifySettingsString.IdleHours, { hours }, language)] as const
      )
    )
    hourLabels = new Map(entries)
  }

  async function toggle (): Promise<void> {
    const next = !isEnabled
    await updateMyPushSetting({ servoneDigest: { isEnabled: next, idleHours, locale } })
    await setMentionEmails(!next)
  }

  function changeIdleHours (event: Event & { currentTarget: HTMLSelectElement }): void {
    const value = event.currentTarget.value
    const hours = DIGEST_IDLE_HOURS.find((candidate) => String(candidate) === value)
    if (hours === undefined) return
    void updateMyPushSetting({ servoneDigest: { isEnabled, idleHours: hours, locale } })
  }
</script>

<div class="flex-col flex-gap-2">
  <div class="flex-row-top flex-gap-2">
    <div class="flex-col flex-gap-1 w-120">
      <span class="label font-semi-bold"><Label label={notifySettingsString.EmailDigest} /></span>
      <span class="description">
        <Label label={notifySettingsString.EmailDigestHint} params={{ x: hourLabels.get(idleHours) ?? '' }} />
      </span>
    </div>
    <ModernToggle
      size="small"
      checked={isEnabled}
      on:change={() => {
        void toggle()
      }}
    />
  </div>
  {#if isEnabled}
    <select class="field" value={String(idleHours)} on:change={changeIdleHours}>
      {#each DIGEST_IDLE_HOURS as hours (hours)}
        <option value={String(hours)}>{hourLabels.get(hours) ?? ''}</option>
      {/each}
    </select>
  {/if}
</div>

<style lang="scss">
  .label {
    color: var(--global-primary-TextColor);
  }

  .description {
    color: var(--global-secondary-TextColor);
  }

  .field {
    align-self: flex-start;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.375rem;
    color: var(--global-primary-TextColor);
    background: var(--theme-bg-color);
    font: inherit;
  }
</style>
