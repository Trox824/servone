<!-- Working hours on the user's Push setting; services/servone/src/push-gate holds web push outside them. -->
<script lang="ts">
  import { Label, ModernToggle } from '@hcengineering/ui'
  import {
    DEFAULT_TIME_ZONE,
    defaultSchedule,
    isTime,
    isTimeZone,
    parseStoredSchedule,
    type StoredSchedule
  } from '@servone/notify-rules'
  import { myPushSettingStore, startPushSettingQuery, updateMyPushSetting } from '../../../../lib/notify/push-setting'
  import { notifySettingsString, WEEK } from '../../../../lib/notify/settings-string'

  startPushSettingQuery()

  function browserTimeZone (): string {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isTimeZone(zone) ? zone : DEFAULT_TIME_ZONE
  }

  $: stored = parseStoredSchedule($myPushSettingStore)
  $: isEnabled = stored?.isEnabled === true
  $: schedule = stored ?? defaultSchedule(browserTimeZone())
  const allZones = Intl.supportedValuesOf('timeZone')
  $: zones = allZones.includes(schedule.timeZone) ? allZones : [schedule.timeZone, ...allZones]

  async function save (next: StoredSchedule): Promise<void> {
    await updateMyPushSetting({ servoneSchedule: next })
  }

  function toggle (): void {
    void save({ ...schedule, isEnabled: !isEnabled })
  }

  function toggleDay (day: number): void {
    const days = schedule.days.includes(day)
      ? schedule.days.filter((candidate) => candidate !== day)
      : [...schedule.days, day].sort((a, b) => a - b)
    if (days.length === 0) return
    void save({ ...schedule, days })
  }

  function changeTime (event: Event & { currentTarget: HTMLInputElement }, edge: 'start' | 'end'): void {
    const time = event.currentTarget.value
    const other = edge === 'start' ? schedule.end : schedule.start
    if (!isTime(time) || time === other) {
      event.currentTarget.value = schedule[edge]
      return
    }
    void save(edge === 'start' ? { ...schedule, start: time } : { ...schedule, end: time })
  }

  function changeZone (event: Event & { currentTarget: HTMLSelectElement }): void {
    const timeZone = event.currentTarget.value
    if (!isTimeZone(timeZone)) return
    void save({ ...schedule, timeZone })
  }
</script>

<div class="flex-col flex-gap-2">
  <span class="label font-semi-bold"><Label label={notifySettingsString.WorkingHours} /></span>
  <div class="flex-row-top flex-gap-2">
    <div class="flex-col flex-gap-1 w-120">
      <span class="label"><Label label={notifySettingsString.HoldOutsideHours} /></span>
      <span class="description"><Label label={notifySettingsString.WorkingHoursHint} /></span>
    </div>
    <ModernToggle size="small" checked={isEnabled} on:change={toggle} />
  </div>
  {#if isEnabled}
    <div class="flex-row-center flex-gap-1">
      {#each WEEK as { day, label } (day)}
        <button
          type="button"
          class="day"
          class:selected={schedule.days.includes(day)}
          aria-pressed={schedule.days.includes(day)}
          on:click={() => {
            toggleDay(day)
          }}
        >
          <Label {label} />
        </button>
      {/each}
    </div>
    <div class="flex-row-center flex-gap-4">
      <label class="flex-row-center flex-gap-2">
        <span class="description"><Label label={notifySettingsString.From} /></span>
        <input
          class="field"
          type="time"
          value={schedule.start}
          on:change={(event) => {
            changeTime(event, 'start')
          }}
        />
      </label>
      <label class="flex-row-center flex-gap-2">
        <span class="description"><Label label={notifySettingsString.To} /></span>
        <input
          class="field"
          type="time"
          value={schedule.end}
          on:change={(event) => {
            changeTime(event, 'end')
          }}
        />
      </label>
      <label class="flex-row-center flex-gap-2">
        <span class="description"><Label label={notifySettingsString.TimeZone} /></span>
        <select class="field" value={schedule.timeZone} on:change={changeZone}>
          {#each zones as zone (zone)}
            <option value={zone}>{zone}</option>
          {/each}
        </select>
      </label>
    </div>
  {/if}
</div>

<style lang="scss">
  .label {
    color: var(--global-primary-TextColor);
  }

  .description {
    color: var(--global-secondary-TextColor);
  }

  .day {
    min-width: 2.5rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.375rem;
    color: var(--global-secondary-TextColor);
    background: transparent;
    cursor: pointer;

    &.selected {
      color: var(--global-primary-TextColor);
      background: var(--theme-button-pressed);
    }
  }

  .field {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.375rem;
    color: var(--global-primary-TextColor);
    background: var(--theme-bg-color);
    font: inherit;
  }
</style>
