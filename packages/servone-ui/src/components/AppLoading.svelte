<!--
  Continues the boot frame in dev/prod/src/index.ejs (keep geometry in sync). No fake content rows:
  the destination may be a calendar, chat or mail. Delays count from page start, not mount, because
  Root and WorkbenchApp each mount their own AppLoading and restarting would blink the text.
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import type { IntlString } from '@hcengineering/platform'
  import { TriangleAlert } from '@lucide/svelte'
  import Loading from './Loading.svelte'
  import Spinner from './Spinner.svelte'
  import { Label } from '../original'
  import { buttonVariants } from '../lib/components/ui/button'

  export let shrink: boolean = false
  export let label: string = ''
  export let size: 'small' | 'medium' | 'large' = 'small'
  export let error: string | undefined = undefined

  const REVEAL_MS = 1000 // most boots finish inside a second; keep in sync with #boot-status in index.ejs
  const SLOW_START_MS = 15000 // past this a stuck connect is likelier than a slow one; same as #boot-slow

  const str = {
    opening: 'ui:string:ServoneOpeningWorkspace' as IntlString,
    slow: 'ui:string:ServoneSlowStart' as IntlString,
    reload: 'ui:string:ServoneReload' as IntlString
  }

  const revealDelay = Math.max(0, REVEAL_MS - performance.now())
  $: hasError = error !== undefined && error !== ''
  const isLoggedOut = localStorage.getItem('login:metadata:LoginEndpoint') === null

  const dispatch = createEventDispatcher()
  let isSlow = false
  onMount(() => {
    const progressTimer = setTimeout(() => {
      dispatch('progress')
    }, 50)
    const slowTimer = setTimeout(() => {
      isSlow = true
    }, Math.max(0, SLOW_START_MS - performance.now()))
    return () => {
      clearTimeout(progressTimer)
      clearTimeout(slowTimer)
    }
  })
</script>

{#if shrink}
  <Loading shrink {label} {size}>
    <slot />
    <slot name="actions" />
  </Loading>
{:else if isLoggedOut && !hasError}
  <div class="h-full w-full bg-shell"></div>
{:else}
  <div class="flex h-full w-full flex-col bg-shell text-foreground">
    <div class="hidden h-10 shrink-0 items-center px-[5.5rem] max-[480px]:flex">
      <div class="h-7 w-full rounded-md border border-border"></div>
    </div>

    <div class="flex min-h-0 flex-1">
      <div class="w-[4.25rem] shrink-0 max-[480px]:hidden"></div>

      <div class="my-2 flex min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-background max-[480px]:my-0 max-[480px]:rounded-none max-[480px]:border-x-0">
        <div
          class="app-loading-reveal flex max-w-md flex-col items-center gap-3 px-6 text-center text-sm text-muted-foreground"
          style:animation-delay="{hasError ? 0 : revealDelay}ms"
          role="status"
        >
          {#if hasError}
            <div class="flex items-center gap-2 text-foreground">
              <TriangleAlert size={16} class="shrink-0 text-amber-600" aria-hidden="true" />
              <span>{error}</span>
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <Spinner size={'small'} />
              <span>{#if label !== ''}{label}{:else}<Label label={str.opening} />{/if}</span>
            </div>
          {/if}
          <!-- WorkbenchApp fills this with workspace-creation and download progress. -->
          <div class="flex items-center [&:not(:has(*))]:hidden"><slot /></div>
          {#if isSlow && !hasError}
            <span><Label label={str.slow} /></span>
          {/if}
        </div>
        <!-- `$$slots.actions` is always true from WorkbenchApp (it wraps {#if} blocks), so emptiness is checked on elements. -->
        <div class="flex justify-center gap-2 [&:not(:has(*))]:hidden"><slot name="actions" /></div>
        {#if isSlow || hasError}
          <button type="button" class={buttonVariants({ variant: 'outline', size: 'sm' })} on:click={() => { window.location.reload() }}>
            <Label label={str.reload} />
          </button>
        {/if}
      </div>

      <div class="w-[calc(3.5rem+1px)] shrink-0 max-[480px]:hidden"></div>
    </div>

    <div class="hidden h-[4.25rem] shrink-0 max-[480px]:block"></div>
  </div>
{/if}

<style>
  .app-loading-reveal {
    animation: reveal 200ms ease-out both;
  }
  @media (prefers-reduced-motion: reduce) {
    .app-loading-reveal {
      animation-duration: 1ms;
    }
  }
</style>
