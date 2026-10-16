<script lang="ts">
  import { Settings2 } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import * as Select from '../../../../lib/components/ui/select'
  import type { Lang } from '../lib/types'
  import { canManageResources } from './api'
  import { TYPE_FILTERS, type TypeFilter } from './grid'
  import { resourceTextOf } from './strings'

  export let lang: Lang
  export let filter: TypeFilter
  export let isMineOnly: boolean
  export let isManaging: boolean

  const canManage = canManageResources()

  $: t = resourceTextOf(lang)
  $: labelOf = (option: TypeFilter): string => (option === 'all' ? t('AllTypes') : t(option))

  const MINE = 'mine'

  function pick (picked: string): void {
    isMineOnly = picked === MINE
    filter = TYPE_FILTERS.find((it) => it === picked) ?? filter
  }
</script>

<Select.Root type="single" value={isMineOnly ? MINE : filter} onValueChange={pick}>
  <Select.Trigger aria-label={t('TypeFilter')}>
    <span class="truncate">{isMineOnly ? t('MyBookings') : labelOf(filter)}</span>
  </Select.Trigger>
  <Select.Content align="end">
    {#each TYPE_FILTERS as option (option)}
      <Select.Item value={option} label={labelOf(option)} />
    {/each}
    <Select.Separator />
    <Select.Item value={MINE} label={t('MyBookings')} />
  </Select.Content>
</Select.Root>
{#if canManage}
  <Button variant="ghost" size="icon" aria-label={t('Manage')} title={t('Manage')} onclick={() => { isManaging = true }}><Settings2 /></Button>
{/if}
