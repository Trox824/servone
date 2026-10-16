<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Label, tooltip } from '@hcengineering/ui'
  import type { ViewOptions, Viewlet } from '@hcengineering/view'
  import { setViewOptions } from '@hcengineering/view-resources'
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui'
  import { Check, TextSearch } from '@lucide/svelte'
  import * as DropdownMenu from '../../../../lib/components/ui/dropdown-menu'
  import { toolbarIconButton } from '../../../../lib/search-classes'
  import { cn } from '../../../../lib/utils'
  import { intl } from '../../../../lib/intl'
  import tracker from '../../plugin'

  export let viewlet: Viewlet
  export let viewOptions: ViewOptions

  const searchOptionsLabel = 'tracker:string:ServoneSearchOptions' as IntlString
  const searchOptionsText = intl(searchOptionsLabel)
  const scopeChoices: Array<{ id: string, label: IntlString }> = [
    { id: 'title', label: tracker.string.SearchScopeTitle },
    { id: 'title-description', label: tracker.string.SearchScopeTitleDescription },
    { id: 'all', label: tracker.string.SearchScopeAll }
  ]
  const itemClass =
    'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground'

  $: scope = String(viewOptions.searchScope ?? 'all')
  $: isHighlighting = viewOptions.searchHighlight !== false

  function update (key: string, nextValue: string | boolean): void {
    setViewOptions(viewlet, { ...viewOptions, [key]: nextValue })
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class={toolbarIconButton}
    aria-label={$searchOptionsText}
  >
    <span class="inline-flex" use:tooltip={{ label: searchOptionsLabel, direction: 'bottom' }}>
      <TextSearch size={14} />
    </span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-72">
    <DropdownMenu.Label class="text-xs text-muted-foreground">
      <Label label={tracker.string.SearchScopeLabel} />
    </DropdownMenu.Label>
    <DropdownMenuPrimitive.RadioGroup
      value={scope}
      onValueChange={(pickedScope) => {
        update('searchScope', pickedScope)
      }}
    >
      {#each scopeChoices as choice (choice.id)}
        <DropdownMenuPrimitive.RadioItem value={choice.id} class={itemClass}>
          <Check size={14} class={cn('shrink-0', choice.id !== scope && 'invisible')} />
          <Label label={choice.label} />
        </DropdownMenuPrimitive.RadioItem>
      {/each}
    </DropdownMenuPrimitive.RadioGroup>
    <DropdownMenu.Separator />
    <DropdownMenuPrimitive.CheckboxItem
      checked={isHighlighting}
      closeOnSelect={false}
      onCheckedChange={(nextIsHighlighting) => {
        update('searchHighlight', nextIsHighlighting)
      }}
      class={itemClass}
    >
      <Check size={14} class={cn('shrink-0', !isHighlighting && 'invisible')} />
      <Label label={tracker.string.SearchHighlight} />
    </DropdownMenuPrimitive.CheckboxItem>
  </DropdownMenu.Content>
</DropdownMenu.Root>
