<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import contact, { formatName, getCurrentEmployee, type Employee } from '@hcengineering/contact'
  import { createQuery } from '@hcengineering/presentation'
  import * as Command from '../../../../lib/components/ui/command'
  import { Checkbox } from '../../../../lib/components/ui/checkbox'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'
  import { textOf } from '../strings'
  import { overlayColor } from '../context'
  import type { Lang } from '../lib/types'
  import PersonAvatar from './PersonAvatar.svelte'

  export let selected: string[]
  export let lang: Lang

  const dispatch = createEventDispatcher<{ change: string[] }>()
  const me = getCurrentEmployee()
  let people: Employee[] = []
  let isLoaded = false
  createQuery().query(contact.mixin.Employee, { active: true }, (found) => {
    people = found.filter((p) => p._id !== me)
    isLoaded = true
  })
  $: t = textOf(lang)

  function toggle (id: string): void {
    dispatch('change', selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }
</script>

<Command.Root>
  <Command.Input placeholder={t('FindColleague')} aria-label={t('FindColleague')} />
  <Command.List class="max-h-64">
    {#if isLoaded}
      <Command.Empty>{t('NoColleagueMatch')}</Command.Empty>
      <Command.Group heading={t('Colleagues')}>
        {#each people as p (p._id)}
          {@const name = formatName(p.name)}
          {@const index = selected.indexOf(p._id)}
          <Command.Item value={p._id} keywords={[name]} onSelect={() => { toggle(p._id) }}>
            <!-- Command.Item sizes every unsized svg to 16px, which would enlarge the checkbox tick past the kit's 14px. -->
            <Checkbox checked={index >= 0} tabindex={-1} aria-hidden="true" class="pointer-events-none [&_svg]:size-3.5!" />
            <PersonAvatar person={p._id} />
            <span class="min-w-0 flex-1 truncate">{name}</span>
            {#if index >= 0}
              <span class="size-2.5 shrink-0 rounded-full" style:background-color={overlayColor(index)}></span>
            {/if}
          </Command.Item>
        {/each}
      </Command.Group>
    {:else}
      <div class="grid gap-2 p-3">
        {#each [0, 1, 2] as row (row)}<Skeleton class="h-6" />{/each}
      </div>
    {/if}
  </Command.List>
</Command.Root>
