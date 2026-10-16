<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Bell, X } from '@lucide/svelte'
  import * as Select from '../../../../../lib/components/ui/select'
  import { Button } from '../../../../../lib/components/ui/button'
  import { canAddReminder } from '../../lib/reminders'
  import type { Lang } from '../../lib/types'
  import { textOf } from '../../strings'
  import { copyFor } from './copy'
  import { beforeText } from './time-slots'

  export let id: string
  export let reminders: number[]
  export let lang: Lang
  export let disabled = false

  const dispatch = createEventDispatcher<{ change: number[] }>()
  const MINUTE = 60 * 1000
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR
  const PRESETS = [5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, DAY]

  let pickerValue = ''

  function add (picked: string): void {
    const ms = Number(picked)
    if (!Number.isFinite(ms) || reminders.includes(ms)) return
    reminders = [...reminders, ms].sort((a, b) => a - b)
    pickerValue = ''
    dispatch('change', reminders)
  }

  function remove (reminder: number): void {
    reminders = reminders.filter((r) => r !== reminder)
    dispatch('change', reminders)
  }

  $: t = copyFor(lang)
  $: available = PRESETS.filter((p) => !reminders.includes(p))
  $: isFull = !canAddReminder(reminders)
</script>

<div class="grid gap-2">
  {#if reminders.length > 0}
    <ul class="m-0 list-none p-0 grid gap-1">
      {#each reminders as reminder (reminder)}
        <li class="flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-sm">
          <Bell class="size-4 shrink-0 text-muted-foreground" />
          <span class="flex-1 truncate">{beforeText(reminder, lang)}</span>
          {#if !disabled}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('remove', { name: beforeText(reminder, lang) })}
              onclick={() => { remove(reminder) }}
            >
              <X />
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if !disabled && isFull}
    <p class="m-0 text-xs text-muted-foreground">{textOf(lang)('ReminderLimit')}</p>
  {:else if !disabled && available.length > 0}
    <Select.Root type="single" bind:value={pickerValue} onValueChange={add}>
      <Select.Trigger {id} class="w-full">{t('addReminder')}</Select.Trigger>
      <Select.Content>
        {#each available as preset (preset)}
          <Select.Item value={String(preset)} label={beforeText(preset, lang)} />
        {/each}
      </Select.Content>
    </Select.Root>
  {:else if reminders.length === 0}
    <p class="m-0 flex h-8 items-center text-sm text-muted-foreground">{t('noReminders')}</p>
  {/if}
</div>
