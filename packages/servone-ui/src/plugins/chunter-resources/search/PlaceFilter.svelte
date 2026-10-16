<script lang="ts">
  import { Avatar } from '@hcengineering/contact-resources'
  import type { Ref, Space } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { Label, themeStore } from '@hcengineering/ui'
  import { Hash } from '@lucide/svelte'
  import * as Command from '../../../lib/components/ui/command'
  import FilterChip from './FilterChip.svelte'
  import type { Place } from './places'
  import { searchStrings } from './strings'

  export let places: Place[]
  export let selected: Array<Ref<Space>>

  let placeholder = ''

  $: void translate(searchStrings.FindPlace, {}, $themeStore.language).then((text) => (placeholder = text))
  $: first = places.find((place) => place._id === selected[0])
  $: selection =
    selected.length === 0
      ? undefined
      : (first === undefined ? '' : first.isDirect ? first.name : `#${first.name}`) + (selected.length > 1 ? ` +${selected.length - 1}` : '')

  function toggle (place: Ref<Space>): void {
    selected = selected.includes(place) ? selected.filter((id) => id !== place) : [...selected, place]
  }
</script>

<FilterChip label={searchStrings.In} {selection} onClear={() => (selected = [])}>
  <Command.Root class="rounded-lg!">
    <Command.Input {placeholder} aria-label={placeholder} />
    <Command.List class="max-h-72">
      <Command.Empty><Label label={searchStrings.NoMatch} /></Command.Empty>
      {#each places as place (place._id)}
        <Command.Item value={place._id} keywords={[place.name]} data-checked={selected.includes(place._id)} onSelect={() => { toggle(place._id) }}>
          {#if place.isDirect}
            <Avatar person={place.person} name={place.person?.name} size="x-small" variant="circle" />
          {:else}
            <span class="flex size-6 shrink-0 items-center justify-center text-muted-foreground"><Hash /></span>
          {/if}
          <span class="min-w-0 truncate">{place.name}</span>
        </Command.Item>
      {/each}
    </Command.List>
  </Command.Root>
</FilterChip>
