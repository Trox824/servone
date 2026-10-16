<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { ChevronLeft, ChevronRight, PanelLeft, Plus, Search, Users, X } from '@lucide/svelte'
  import { deviceOptionsStore as deviceInfo } from '@hcengineering/ui'
  import { Button, buttonVariants } from '../../../../lib/components/ui/button'
  import * as Tabs from '../../../../lib/components/ui/tabs'
  import * as Select from '../../../../lib/components/ui/select'
  import * as InputGroup from '../../../../lib/components/ui/input-group'
  import * as Popover from '../../../../lib/components/ui/popover'
  import * as Tooltip from '../../../../lib/components/ui/tooltip'
  import { textOf } from '../strings'
  import { shortTitleOf, titleOf } from '../lib/format'
  import { isView, PHONE_VIEWS, shift, VIEWS } from '../lib/view'
  import type { Lang, View } from '../lib/types'
  import ColleaguePicker from './ColleaguePicker.svelte'

  export let view: View
  export let isOnView: boolean
  export let anchor: number
  export let lang: Lang
  export let firstDayOfWeek: number
  export let overlay: string[]
  export let search: string
  export let isNavigatorOpen: boolean

  const dispatch = createEventDispatcher<{ view: View, anchor: number, overlay: string[], search: undefined, clear: undefined, create: HTMLElement, navigator: undefined }>()
  const LABELS = { ngay: 'Day', 'ba-ngay': 'ThreeDays', tuan: 'Week', thang: 'Month', 'lich-bieu': 'Agenda' } as const
  $: t = textOf(lang)

  let isSearchOpen = false

  function pickView (next: string): void {
    if (isView(next)) dispatch('view', next)
  }
  function submitSearch (): void {
    if (search.trim() !== '') dispatch('search')
  }
  function clearSearch (): void {
    search = ''
    dispatch('clear')
  }
</script>

<Tooltip.Provider>
  <header class="flex shrink-0 items-center gap-2 border-b border-border {$deviceInfo.isMobile ? 'flex-wrap px-2 py-1.5' : 'h-14 px-4'}">
    {#if $deviceInfo.isMobile}
      <Button variant={isNavigatorOpen ? 'secondary' : 'ghost'} size="icon" data-app-menu aria-label={t('CalendarMenu')} aria-expanded={isNavigatorOpen} onclick={() => { dispatch('navigator') }}><PanelLeft /></Button>
    {/if}
    <Button variant="outline" onclick={() => { dispatch('anchor', Date.now()) }}>{t('Today')}</Button>
    <div class="flex items-center gap-0.5">
      <Tooltip.Root>
        <Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label={t('Previous')} onclick={() => { dispatch('anchor', shift(view, anchor, -1)) }}><ChevronLeft /></Tooltip.Trigger>
        <Tooltip.Content>{t('Previous')}</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label={t('Next')} onclick={() => { dispatch('anchor', shift(view, anchor, 1)) }}><ChevronRight /></Tooltip.Trigger>
        <Tooltip.Content>{t('Next')}</Tooltip.Content>
      </Tooltip.Root>
    </div>
    <!-- flex-1, not ml-auto on the group: Huly's `.gap-2 > :not(:first-child)` margin reset outranks ml-auto. -->
    <h1 class="m-0 min-w-0 flex-1 truncate text-base font-semibold tabular-nums">{$deviceInfo.isMobile ? shortTitleOf(view, anchor, lang) : titleOf(view, anchor, firstDayOfWeek, lang)}</h1>

    <div class="flex shrink-0 items-center gap-2 {$deviceInfo.isMobile ? 'w-full' : ''}">
      {#if $deviceInfo.isMobile}
        <Select.Root type="single" value={isOnView ? view : ''} onValueChange={pickView}>
          <Select.Trigger class="min-w-0 flex-1" aria-label={t('View')}>{t(LABELS[view])}</Select.Trigger>
          <Select.Content data-lich-pop>
            {#each PHONE_VIEWS as v (v)}
              <Select.Item value={v} label={t(LABELS[v])} />
            {/each}
          </Select.Content>
        </Select.Root>
      {:else}
        <Tabs.Root value={isOnView ? view : ''} onValueChange={pickView}>
          <Tabs.List>
            {#each VIEWS as v (v)}
              <Tabs.Trigger value={v}>{t(LABELS[v])}</Tabs.Trigger>
            {/each}
          </Tabs.List>
        </Tabs.Root>
      {/if}
      {#if isSearchOpen || search !== ''}
        <form role="search" class={$deviceInfo.isMobile ? 'min-w-0 flex-1' : ''} on:submit|preventDefault={submitSearch}>
          <InputGroup.Root class={$deviceInfo.isMobile ? 'w-full' : 'w-40 xl:w-56'}>
            <InputGroup.Addon><Search /></InputGroup.Addon>
            <!-- svelte-ignore a11y-autofocus -->
            <InputGroup.Input bind:value={search} autofocus placeholder={t('Search')} aria-label={t('Search')} onblur={() => { if (search === '') isSearchOpen = false }} />
            {#if search !== ''}
              <InputGroup.Addon align="inline-end">
                <InputGroup.Button size="icon-xs" aria-label={t('ClearSearch')} onclick={clearSearch}><X /></InputGroup.Button>
              </InputGroup.Addon>
            {/if}
          </InputGroup.Root>
        </form>
      {:else}
        <Tooltip.Root>
          <Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label={t('Search')} onclick={() => { isSearchOpen = true }}><Search /></Tooltip.Trigger>
          <Tooltip.Content>{t('Search')}</Tooltip.Content>
        </Tooltip.Root>
      {/if}
      <Popover.Root>
          <Popover.Trigger class={buttonVariants({ variant: overlay.length > 0 ? 'secondary' : 'ghost', size: overlay.length > 0 ? 'default' : 'icon' })} aria-label={t('Colleagues')} title={t('Colleagues')}>
            <Users />
            {#if overlay.length > 0}<span class="tabular-nums">{overlay.length}</span>{/if}
          </Popover.Trigger>
          <Popover.Content align="end" class="w-72 gap-0 overflow-hidden p-0" data-lich-pop>
            <ColleaguePicker selected={overlay} {lang} on:change={(e) => { dispatch('overlay', e.detail) }} />
          </Popover.Content>
        </Popover.Root>
      {#if !$deviceInfo.isMobile}
        <Button data-coach="lich-create" onclick={(e) => { dispatch('create', e.currentTarget) }}><Plus />{t('Create')}</Button>
      {/if}
    </div>
  </header>
</Tooltip.Provider>
