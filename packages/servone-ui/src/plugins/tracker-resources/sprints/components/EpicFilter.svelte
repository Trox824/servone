<!-- Huly's own filter menu has no epic (parent issue) filter. -->
<script lang="ts">
  import type { Issue } from '@hcengineering/tracker'
  import { DropdownLabels, type DropdownTextItem } from '@hcengineering/ui'
  import type { IssueFilter } from '../filters'
  import { icon, str } from '../plugin'
  import { translate } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/ui'

  export let epics: Issue[]
  export let filter: IssueFilter

  let allLabel = ''
  $: void translate(str.AllEpics, {}, $themeStore.language).then((t) => (allLabel = t))
  $: items = [
    { id: 'all', label: allLabel },
    ...epics.map((e) => ({ id: e._id as string, label: `${e.identifier} ${e.title}` }))
  ] as DropdownTextItem[]

  function select (id: string | undefined): void {
    filter = { ...filter, epic: id ?? 'all' }
  }
</script>

{#if epics.length > 0}
  <DropdownLabels
    {items}
    icon={icon.epic}
    kind={filter.epic === 'all' ? 'ghost' : 'regular'}
    size={'small'}
    showDropdownIcon
    selected={filter.epic}
    on:selected={(e) => select(e.detail)}
  />
{/if}
