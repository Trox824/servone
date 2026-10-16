<script lang="ts">
  import type { IModeSelector } from '../original'
  import { Label, tooltip } from '../original'
  import { Tabs, TabsList, TabsTrigger } from '../lib/components/ui/tabs'
  import { cn } from '../lib/utils'

  export let props: IModeSelector
  export let kind: 'nuance' | 'subtle' = 'nuance'
  export let onlyIcons: boolean = false
  export let expansion: 'stretch' | 'default' = 'default'
  export let padding: string | undefined = undefined

  $: isDisabled = props.disabled === true
  $: tooltipOptions =
    isDisabled && props.disabledReason !== undefined
      ? { label: props.disabledReason, direction: 'bottom' as const }
      : undefined

  function pickMode (modeId: string): void {
    if (isDisabled) return
    props.onChange(modeId)
  }

  const subtleListClasses = 'bg-transparent p-0 gap-1'
  const subtleTriggerClasses = [
    'h-7 rounded-full border-0 bg-muted/60 px-3 text-xs font-medium text-muted-foreground shadow-none',
    'hover:bg-muted hover:text-foreground',
    'data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none'
  ].join(' ')

  $: isStretched = expansion === 'stretch'
  $: isSubtle = kind === 'subtle'
</script>

{#if props.config !== undefined && props.config.length > 0}
  <div style:padding use:tooltip={tooltipOptions}>
    <div class={cn(isDisabled && 'pointer-events-none opacity-50')}>
    <Tabs value={props.mode} onValueChange={pickMode}>
      <TabsList class={cn(isSubtle && subtleListClasses, isStretched && 'w-full')}>
        {#each props.config as [modeId, modeLabel, modeParams] (modeId)}
          <TabsTrigger value={modeId} class={cn(isSubtle && subtleTriggerClasses, isStretched && 'flex-1')}>
            {#if !onlyIcons}
              <Label label={modeLabel} params={modeParams} />
            {/if}
          </TabsTrigger>
        {/each}
      </TabsList>
    </Tabs>
    </div>
  </div>
{/if}
