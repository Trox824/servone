<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { IntlString } from '@hcengineering/platform'
  import { Icon, IconClose, IconLeft, Label, Scroller, resizeObserver } from '../original'
  import type { AnySvelteComponent, ButtonKind } from '../original'
  import ui from '@hcengineering/ui/src/plugin'
  import { cn } from '../lib/utils'

  export let label: IntlString
  export let labelProps: any | undefined = undefined
  export let submitLabel: IntlString = ui.string.Submit
  export let submitKind: ButtonKind = 'primary'
  export let cancelLabel: IntlString = ui.string.Cancel
  export let canSubmit: boolean = false
  export let hideSubmit: boolean = false
  export let shouldSubmitOnEnter: boolean = false
  export let shouldCloseOnCancel: boolean = true
  export let hasBack: boolean = false
  export let isForm: boolean = true
  export let embedded: boolean = false
  export let width: string | undefined = undefined
  export let isFooterBorderHidden: boolean = false
  export let loading: boolean = false
  export let noContentPadding: boolean = false
  export let scrollableContent: boolean = true
  export let withoutFooter: boolean = false
  export let closeIcon: AnySvelteComponent = IconClose
  export let shadow: boolean = false
  export let className: string = ''

  const dispatch = createEventDispatcher<{
    submit: undefined
    close: undefined
    cancel: undefined
    back: undefined
    changeContent: undefined
  }>()

  const submitColorsByKind: Record<string, string> = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    attention: 'bg-primary text-primary-foreground hover:bg-primary/90',
    positive: 'bg-emerald-600 text-white hover:bg-emerald-600/90',
    negative: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    dangerous: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    warning: 'bg-amber-500 text-white hover:bg-amber-500/90',
    ghost: 'bg-transparent hover:bg-accent hover:text-accent-foreground',
    'no-border': 'bg-transparent hover:bg-accent hover:text-accent-foreground',
    link: 'bg-transparent hover:bg-accent hover:text-accent-foreground',
    'link-bordered': 'bg-transparent hover:bg-accent hover:text-accent-foreground',
    icon: 'bg-transparent hover:bg-accent hover:text-accent-foreground'
  }
  const fallbackSubmitColors = 'border border-input bg-background hover:bg-accent'
  const footerButtonBase =
    'inline-flex h-9 min-w-[6.25rem] items-center justify-center rounded-md px-4 text-sm font-medium'

  function handleNativeSubmit (event: Event): void {
    event.preventDefault()
    if (isForm && shouldSubmitOnEnter) dispatch('submit')
  }

  function handleCancel (): void {
    dispatch('cancel')
    if (shouldCloseOnCancel) dispatch('close')
  }

  $: hasFooterSlots =
    $$slots.footerExtra === true ||
    $$slots.footerButtons === true ||
    $$slots.btnsXtraStart === true ||
    $$slots.btnsXtraBetween === true ||
    $$slots.btnsXtraEnd === true
  $: isFooterShown = !withoutFooter || hasFooterSlots
  $: isSubmitInactive = !canSubmit || loading
  $: submitColors = submitColorsByKind[submitKind] ?? fallbackSubmitColors
</script>

<svelte:element
  this={isForm ? 'form' : 'div'}
  class={cn(
    'flex flex-col items-stretch',
    embedded
      ? 'h-full w-full'
      : 'max-h-[80vh] w-[58.25rem] max-w-full rounded-xl border border-border bg-background',
    !embedded && shadow && 'shadow-lg',
    className
  )}
  style:width
  use:resizeObserver={() => dispatch('changeContent')}
  on:submit={handleNativeSubmit}
>
  <div
    class="flex flex-none flex-wrap items-start justify-between gap-2 border-b border-border px-6 pb-3.5 pt-5"
  >
    <slot name="headerLeft">
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-1.5">
          {#if hasBack}
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md pl-0 pr-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              on:click={() => dispatch('back')}
            >
              <Icon icon={IconLeft} size="small" />
              <Label label={ui.string.Back} />
            </button>
          {/if}
          <slot name="headerExtra" />
        </div>
        <span class="text-xl text-foreground">
          <Label {label} params={labelProps} />
        </span>
      </div>
    </slot>
    <slot name="headerRight">
      {#if !embedded}
        <button
          type="button"
          class="inline-flex h-7 w-7 flex-none items-center justify-center rounded-sm opacity-70 hover:bg-accent hover:opacity-100"
          on:click={() => dispatch('close')}
        >
          <Icon icon={closeIcon} size="medium" />
        </button>
      {/if}
    </slot>
  </div>

  {#if scrollableContent}
    <Scroller>
      <div class={cn('flex min-h-0 flex-1 flex-col items-stretch', noContentPadding ? 'px-0' : 'px-6')}>
        {#if !noContentPadding}<div class="h-5 w-full"></div>{/if}
        <slot />
        {#if !noContentPadding}<div class="h-8 w-full"></div>{/if}
      </div>
    </Scroller>
  {:else}
    <div class={cn('flex min-h-0 flex-1 flex-col items-stretch', noContentPadding ? 'px-0' : 'px-6')}>
      {#if !noContentPadding}<div class="h-5 w-full"></div>{/if}
      <slot />
      {#if !noContentPadding}<div class="h-8 w-full"></div>{/if}
    </div>
  {/if}

  {#if isFooterShown}
    <div
      class={cn(
        'flex h-[4.875rem] flex-none items-center justify-between px-6',
        !isFooterBorderHidden && 'border-t border-border'
      )}
    >
      <slot name="footerExtra"><div></div></slot>
      <slot name="footerButtons">
        <div class="flex flex-nowrap items-center gap-3">
          <slot name="btnsXtraStart" />
          <button
            type="button"
            class={cn(footerButtonBase, 'border border-input bg-background hover:bg-accent', loading && 'pointer-events-none opacity-70')}
            on:click={handleCancel}
          >
            <Label label={cancelLabel} />
          </button>
          <slot name="btnsXtraBetween" />
          {#if !hideSubmit}
            <button
              type="button"
              disabled={!canSubmit}
              class={cn(footerButtonBase, submitColors, isSubmitInactive && 'pointer-events-none opacity-50')}
              on:click={() => dispatch('submit')}
            >
              <Label label={submitLabel} />
            </button>
          {/if}
          <slot name="btnsXtraEnd" />
        </div>
      </slot>
    </div>
  {/if}
</svelte:element>
