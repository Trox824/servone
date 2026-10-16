<script lang="ts">
  import { translate, type IntlString } from '@hcengineering/platform'
  import { Label, themeStore } from '@hcengineering/ui'
  import * as Command from '../../../lib/components/ui/command'
  import FilterChip from './FilterChip.svelte'

  export let label: IntlString
  export let options: Array<{ id: string, label: IntlString }>
  export let selected: string
  export let anyId: string | undefined = undefined

  let selection: string | undefined
  $: chosen = options.find((option) => option.id === selected)
  $: void updateSelection(chosen, $themeStore.language)

  async function updateSelection (option: { id: string, label: IntlString } | undefined, language: string): Promise<void> {
    selection = option === undefined || option.id === anyId ? undefined : await translate(option.label, {}, language)
  }
</script>

<FilterChip {label} {selection} onClear={anyId === undefined ? undefined : () => (selected = anyId ?? selected)} let:close>
  <Command.Root class="rounded-lg!">
    <Command.List>
      {#each options as option (option.id)}
        <Command.Item
          value={option.id}
          data-checked={option.id === selected}
          onSelect={() => {
            selected = option.id
            close()
          }}
        >
          <Label label={option.label} />
        </Command.Item>
      {/each}
    </Command.List>
  </Command.Root>
</FilterChip>
