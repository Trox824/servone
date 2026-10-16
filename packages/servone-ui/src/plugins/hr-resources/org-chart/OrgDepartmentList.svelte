<script lang="ts">
  import type { Employee } from '@hcengineering/contact'
  import { PersonPresenter } from '@hcengineering/contact-resources'
  import type { Department } from '@hcengineering/hr'
  import { Label } from '@hcengineering/ui'
  import { ChevronRight } from '@lucide/svelte'
  import type { LeaveDay } from '../../../lib/leave'
  import type { ChartNode } from './chart'
  import { str } from './plugin'

  export let node: ChartNode<Department>
  export let people: Map<string, Employee>
  export let names: Map<string, string>
  export let off: Map<string, LeaveDay>
  export let selected: string | undefined
  export let onSelect: (person: string) => void

  $: head = node.head === undefined ? undefined : people.get(node.head)
  $: members = node.members
    .map((id) => people.get(id))
    .filter((employee): employee is Employee => employee !== undefined)
    .sort((a, b) => (names.get(a._id) ?? '').localeCompare(names.get(b._id) ?? '', 'vi'))
</script>

<details open class="dept">
  <summary class="flex min-h-12 cursor-pointer list-none items-center gap-2 border-b px-4 text-sm font-semibold">
    <ChevronRight class="chevron size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span class="min-w-0 flex-1 truncate">{node.department.name}</span>
    <span class="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
      <Label label={str.People} params={{ count: node.total }} />
    </span>
  </summary>
  <div class="pl-4">
    {#if head !== undefined}
      <button type="button" class="person" class:is-selected={selected === head._id} on:click={() => { onSelect(head._id) }}>
        <PersonPresenter value={head} avatarSize={'x-small'} disabled />
        <span class="ml-auto flex shrink-0 items-center gap-2">
          {#if off.has(head._id)}
            <span class="text-xs text-muted-foreground"><Label label={str.Off} /></span>
          {/if}
          <span class="rounded bg-accent px-1.5 text-[11px] font-medium text-muted-foreground"><Label label={str.Lead} /></span>
        </span>
      </button>
    {/if}
    {#each members as member (member._id)}
      <button type="button" class="person" class:is-selected={selected === member._id} on:click={() => { onSelect(member._id) }}>
        <PersonPresenter value={member} avatarSize={'x-small'} disabled />
        {#if off.has(member._id)}
          <span class="ml-auto shrink-0 text-xs text-muted-foreground"><Label label={str.Off} /></span>
        {/if}
      </button>
    {/each}
    {#each node.children as child (child.department._id)}
      <svelte:self node={child} {people} {names} {off} {selected} {onSelect} />
    {/each}
  </div>
</details>

<style>
  .person {
    display: flex;
    width: 100%;
    min-height: 2.75rem;
    align-items: center;
    justify-content: flex-start;
    padding: 0 1rem 0 0.5rem;
    border-bottom: 1px solid var(--border);
    text-align: left;
  }
  .person.is-selected {
    background: var(--accent);
  }
  summary::-webkit-details-marker {
    display: none;
  }
  details[open] > summary :global(.chevron) {
    transform: rotate(90deg);
  }
</style>
