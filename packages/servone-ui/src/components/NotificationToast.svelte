<script lang="ts">
  import { cubicOut } from 'svelte/easing'
  import { fade, fly } from 'svelte/transition'
  import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from '@lucide/svelte'
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { NotificationSeverity } from '../original'

  export let onClose: (() => void) | undefined = undefined
  export let severity: NotificationSeverity | undefined = undefined
  export let title: string

  const ENTER_OFFSET_PX = 16
  const isMotionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const severityIcons = {
    [NotificationSeverity.Success]: { icon: CircleCheck, colorClass: 'text-emerald-600 dark:text-emerald-400' },
    [NotificationSeverity.Info]: { icon: Info, colorClass: 'text-muted-foreground' },
    [NotificationSeverity.Warning]: { icon: TriangleAlert, colorClass: 'text-amber-600 dark:text-amber-400' },
    [NotificationSeverity.Error]: { icon: CircleAlert, colorClass: 'text-destructive' }
  }

  let closeLabel = ''
  $: translateCB('presentation:string:Close' as IntlString, {}, $themeStore.language, (label) => {
    closeLabel = label
  })

  $: severityIcon = severity === undefined ? undefined : severityIcons[severity]
  $: hasLeading = $$slots.icon || severityIcon !== undefined
</script>

<div
  class="notifyPopup m-3 flex w-[22rem] max-w-[calc(100vw-1.5rem)] items-start gap-2.5 rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
  role={severity === NotificationSeverity.Error ? 'alert' : 'status'}
  in:fly={{ x: isMotionReduced ? 0 : ENTER_OFFSET_PX, duration: 200, easing: cubicOut }}
  out:fade={{ duration: 150 }}
>
  {#if hasLeading}
    <div class="flex h-5 flex-none items-center {severityIcon?.colorClass ?? ''}">
      <slot name="icon">
        {#if severityIcon}
          <svelte:component this={severityIcon.icon} size={16} strokeWidth={1.75} aria-hidden="true" />
        {/if}
      </slot>
    </div>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
    <p class="line-clamp-2 break-words text-[13px] font-medium leading-5 text-foreground">{title}</p>
    <div class="toast-body text-[13px] leading-5 text-muted-foreground">
      <slot name="content" />
    </div>
    {#if $$slots.buttons}
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <slot name="buttons" />
      </div>
    {/if}
  </div>

  {#if onClose !== undefined}
    <button
      type="button"
      data-id="btnNotifyClose"
      aria-label={closeLabel}
      class="-mr-1 -mt-0.5 inline-flex size-6 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      on:click={onClose}
    >
      <X size={14} strokeWidth={1.75} aria-hidden="true" />
    </button>
  {/if}
</div>

<style>
  .toast-body :global(.overflow-label) {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
    overflow-wrap: anywhere;
  }
</style>
