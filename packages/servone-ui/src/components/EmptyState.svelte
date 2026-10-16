<!--
  Not a kit component: drawn by the Table / List / Chat shadows. Whether to show it is the caller's
  decision (see lib/empty-state.ts).
-->
<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import type { ComponentType } from 'svelte'
  import { Inbox } from '@lucide/svelte'
  import { Icon, Label, themeStore, type AnySvelteComponent } from '../original'
  import { emptyStateStrings } from '../lib/empty-state'
  import type { EmptyAction } from '../onboarding/empty-copy'
  import { Button } from '../lib/components/ui/button'

  export let icon: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let iconProps: Record<string, any> | undefined = undefined
  /** Plural page label → "No {label} yet". Ignored when `title` is given. */
  export let label: IntlString | undefined = undefined
  /** Show the "Create one with the button above" line (only meaningful with `label`). */
  export let hint: boolean = false
  export let title: IntlString | undefined = undefined
  export let description: IntlString | undefined = undefined
  export let actions: EmptyAction[] = []

  let noun: string = ''
  $: if (label !== undefined) {
    translateCB(label, {}, $themeStore.language, (res) => {
      noun = $themeStore.language === 'de' ? res : res.toLocaleLowerCase($themeStore.language)
    })
  }
</script>

<div
  data-slot="empty-state"
  class="flex flex-col items-center justify-center gap-2 py-24 text-center select-none"
  role="status"
  aria-live="polite"
>
  <div class="size-8 text-muted-foreground/60" aria-hidden="true">
    {#if icon !== undefined}
      <Icon {icon} {iconProps} size={'full'} />
    {:else}
      <Inbox class="size-8" strokeWidth={1.5} />
    {/if}
  </div>
  <div class="text-sm font-medium text-foreground">
    {#if title !== undefined}
      <Label label={title} />
    {:else if label !== undefined}
      <Label label={emptyStateStrings.title} params={{ label: noun }} />
    {/if}
  </div>
  {#if description !== undefined}
    <div class="text-xs text-muted-foreground max-w-xs"><Label label={description} /></div>
  {:else if hint && label !== undefined}
    <div class="text-xs text-muted-foreground"><Label label={emptyStateStrings.hint} /></div>
  {/if}
  {#if actions.length > 0}
    <div class="mt-2 flex flex-wrap justify-center gap-2">
      {#each actions as action, index (index)}
        <Button size="sm" variant={index === 0 ? 'default' : 'outline'} onclick={action.run}><Label label={action.label} /></Button>
      {/each}
    </div>
  {/if}
</div>
