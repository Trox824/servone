<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Repeat } from '@lucide/svelte'
  import * as Select from '../../../../../lib/components/ui/select'
  import * as Dialog from '../../../../../lib/components/ui/dialog'
  import * as ToggleGroup from '../../../../../lib/components/ui/toggle-group'
  import * as RadioGroup from '../../../../../lib/components/ui/radio-group'
  import { Button } from '../../../../../lib/components/ui/button'
  import { Input } from '../../../../../lib/components/ui/input'
  import { Label } from '../../../../../lib/components/ui/label'
  import { recurrenceText } from '../../lib/recurrence'
  import type { Lang } from '../../lib/types'
  import { copyFor, type CopyKey } from './copy'
  import DatePicker from './DatePicker.svelte'
  import {
    FREQS,
    PRESETS,
    WEEKDAY_CODES,
    customFrom,
    customRule,
    isFreq,
    presetLabel,
    presetOf,
    presetRules,
    type CustomRepeat,
    type Freq,
    type RepeatEnd,
    type RepeatRule,
    type RuleFields
  } from './repeat'

  export let id: string
  export let rules: RuleFields[]
  export let startDate: number
  export let lang: Lang
  export let firstDayOfWeek: number
  export let disabled = false

  const dispatch = createEventDispatcher<{ change: RepeatRule[] }>()
  const CUSTOM = 'custom'
  const FREQ_UNIT: Record<Freq, CopyKey> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }
  const VI_DAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  const EN_DAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  const ENDS: readonly RepeatEnd[] = ['never', 'on', 'after']

  let isCustomOpen = false
  let form: CustomRepeat = customFrom(undefined, startDate, endOfDay(startDate))

  function endOfDay (ts: number): number {
    return new Date(ts).setHours(23, 59, 59, 999)
  }

  function isEnd (text: string): text is RepeatEnd {
    return ENDS.some((e) => e === text)
  }

  function choose (picked: string): void {
    if (picked === CUSTOM) {
      form = customFrom(rules[0], startDate, endOfDay(startDate))
      isCustomOpen = true
      return
    }
    const preset = PRESETS.find((p) => p === picked)
    if (preset !== undefined) dispatch('change', presetRules(preset, startDate))
  }

  function selectValueFor (next: RuleFields[], start: number): string {
    const preset = presetOf(next, start)
    return preset === CUSTOM ? '' : preset
  }

  function applyCustom (): void {
    const next = [customRule(form, rules[0], startDate)]
    dispatch('change', next)
    selectValue = selectValueFor(next, startDate)
    isCustomOpen = false
  }

  function cancelCustom (): void {
    isCustomOpen = false
    selectValue = selectValueFor(rules, startDate)
  }

  $: t = copyFor(lang)
  $: current = presetOf(rules, startDate)
  $: selectValue = selectValueFor(rules, startDate)
  $: triggerText = current === CUSTOM ? recurrenceText(rules, lang) : presetLabel(current, startDate, lang)
  $: weekOrder = Array.from({ length: 7 }, (_, i) => (firstDayOfWeek + i) % 7)
</script>

<Select.Root
  type="single"
  bind:value={selectValue}
  onValueChange={choose}
  {disabled}
>
  <Select.Trigger {id} class="w-full">
    <span class="flex min-w-0 items-center gap-2">
      <Repeat class="text-muted-foreground" />
      <span class="truncate">{triggerText}</span>
    </span>
  </Select.Trigger>
  <Select.Content>
    {#each PRESETS as preset (preset)}
      <Select.Item value={preset} label={presetLabel(preset, startDate, lang)} />
    {/each}
    <Select.Separator />
    <Select.Item value={CUSTOM} label={t('custom')} />
  </Select.Content>
</Select.Root>

<Dialog.Root
  open={isCustomOpen}
  onOpenChange={(isOpen) => {
    if (!isOpen) cancelCustom()
  }}
>
  <Dialog.Content class="sm:max-w-sm">
    <Dialog.Header>
      <Dialog.Title>{t('customTitle')}</Dialog.Title>
    </Dialog.Header>
    <div class="grid gap-4">
      <div class="grid gap-1.5">
        <Label for="{id}-interval">{t('every')}</Label>
        <div class="grid grid-cols-[5rem_1fr] gap-2">
          <Input id="{id}-interval" type="number" min="1" bind:value={form.interval} class="tabular-nums" />
          <Select.Root
            type="single"
            value={form.freq}
            onValueChange={(picked) => { if (isFreq(picked)) form = { ...form, freq: picked } }}
          >
            <Select.Trigger class="w-full" aria-label={t('repeat')}>{t(FREQ_UNIT[form.freq])}</Select.Trigger>
            <Select.Content>
              {#each FREQS as freq (freq)}
                <Select.Item value={freq} label={t(FREQ_UNIT[freq])} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      {#if form.freq === 'WEEKLY'}
        <div class="grid gap-1.5">
          <Label id="{id}-days-label">{t('onDays')}</Label>
          <ToggleGroup.Root
            type="multiple"
            variant="outline"
            size="sm"
            value={form.byDay}
            onValueChange={(days) => { form = { ...form, byDay: days } }}
            aria-labelledby="{id}-days-label"
            class="w-full"
          >
            {#each weekOrder as day (day)}
              <ToggleGroup.Item value={WEEKDAY_CODES[day]} class="flex-1">{(lang === 'vi' ? VI_DAY : EN_DAY)[day]}</ToggleGroup.Item>
            {/each}
          </ToggleGroup.Root>
        </div>
      {/if}
      <div class="grid gap-1.5">
        <Label id="{id}-end-label">{t('endsLabel')}</Label>
        <RadioGroup.Root
          value={form.end}
          onValueChange={(picked) => { if (isEnd(picked)) form = { ...form, end: picked } }}
          aria-labelledby="{id}-end-label"
          class="gap-2"
        >
          <div class="flex h-8 items-center gap-2">
            <RadioGroup.Item id="{id}-end-never" value="never" />
            <Label for="{id}-end-never" class="font-normal">{t('never')}</Label>
          </div>
          <div class="grid grid-cols-[auto_5rem_1fr] items-center gap-2">
            <RadioGroup.Item id="{id}-end-on" value="on" />
            <Label for="{id}-end-on" class="font-normal">{t('onDate')}</Label>
            <DatePicker
              id="{id}-end-date"
              value={form.endDate}
              min={startDate}
              {lang}
              {firstDayOfWeek}
              disabled={form.end !== 'on'}
              on:change={(e) => { form = { ...form, endDate: endOfDay(e.detail) } }}
            />
          </div>
          <div class="grid grid-cols-[auto_5rem_5rem_1fr] items-center gap-2">
            <RadioGroup.Item id="{id}-end-after" value="after" />
            <Label for="{id}-end-after" class="font-normal">{t('after')}</Label>
            <Input
              type="number"
              min="1"
              aria-label={t('occurrences')}
              bind:value={form.count}
              disabled={form.end !== 'after'}
              class="tabular-nums"
            />
            <span class="text-sm text-muted-foreground">{t('occurrences')}</span>
          </div>
        </RadioGroup.Root>
      </div>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={cancelCustom}>{t('cancel')}</Button>
      <Button onclick={applyCustom}>{t('apply')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
