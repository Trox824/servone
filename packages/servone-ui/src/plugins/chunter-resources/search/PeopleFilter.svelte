<script lang="ts">
  import contact, { formatName, getCurrentEmployee, type Employee, type Person } from '@hcengineering/contact'
  import { Avatar } from '@hcengineering/contact-resources'
  import type { Ref } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import { Label, themeStore } from '@hcengineering/ui'
  import * as Command from '../../../lib/components/ui/command'
  import FilterChip from './FilterChip.svelte'
  import { searchStrings } from './strings'

  export let selected: Array<Ref<Person>>

  const me = getCurrentEmployee()
  let people: Employee[] = []
  let placeholder = ''

  createQuery().query(contact.mixin.Employee, { active: true }, (found) => {
    people = found.sort((a, b) => Number(b._id === me) - Number(a._id === me) || formatName(a.name).localeCompare(formatName(b.name)))
  })

  $: void translate(searchStrings.FindPerson, {}, $themeStore.language).then((text) => (placeholder = text))
  $: names = new Map(people.map((person) => [person._id as Ref<Person>, formatName(person.name)]))
  $: selection = selected.length === 0 ? undefined : (names.get(selected[0]) ?? '') + (selected.length > 1 ? ` +${selected.length - 1}` : '')

  function toggle (person: Ref<Person>): void {
    selected = selected.includes(person) ? selected.filter((id) => id !== person) : [...selected, person]
  }
</script>

<FilterChip label={searchStrings.From} {selection} onClear={() => (selected = [])}>
  <Command.Root class="rounded-lg!">
    <Command.Input {placeholder} aria-label={placeholder} />
    <Command.List class="max-h-72">
      <Command.Empty><Label label={searchStrings.NoMatch} /></Command.Empty>
      {#each people as person (person._id)}
        {@const name = names.get(person._id) ?? ''}
        <Command.Item value={person._id} keywords={[name]} data-checked={selected.includes(person._id)} onSelect={() => { toggle(person._id) }}>
          <Avatar {person} name={person.name} size="x-small" variant="circle" />
          <span class="min-w-0 truncate">{name}</span>
          {#if person._id === me}<span class="shrink-0 text-muted-foreground">(<Label label={searchStrings.You} />)</span>{/if}
        </Command.Item>
      {/each}
    </Command.List>
  </Command.Root>
</FilterChip>
