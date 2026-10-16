<!-- Lines: .kids::before drops from the parent, each .kid's ::before/::after are the bar halves, as in the servone-web /hrm mock. -->
<script lang="ts">
  import { getName, type Employee } from '@hcengineering/contact'
  import { PersonPresenter } from '@hcengineering/contact-resources'
  import type { Department } from '@hcengineering/hr'
  import { getClient } from '@hcengineering/presentation'
  import { ButtonIcon, IconEdit, Label, SelectPopup, eventToHTMLElement, showPopup, tooltip } from '@hcengineering/ui'
  import { themeStore } from '@hcengineering/theme'
  import { translateCB } from '@hcengineering/platform'
  import { Plus } from '@lucide/svelte'
  import { Button } from '../../../lib/components/ui/button'
  import { openDoc } from '@hcengineering/view-resources'
  import CreateDepartment from '../components/CreateDepartment.svelte'
  import type { LeaveDay } from '../../../lib/leave'
  import type { ChartNode } from './chart'
  import { str } from './plugin'

  export let node: ChartNode<Department>
  export let people: Map<string, Employee>
  export let names: Map<string, string>
  export let off: Map<string, LeaveDay>
  export let selected: string | undefined
  export let path: string[]
  export let onSelect: (person: string) => void

  const VISIBLE_MEMBERS = 5

  const client = getClient()

  let addLabel = ''
  $: translateCB(str.AddSubDepartment, {}, $themeStore.language, (text) => { addLabel = text })

  let isExpanded = false

  $: head = node.head === undefined ? undefined : people.get(node.head)
  $: members = node.members
    .map((id) => people.get(id))
    .filter((employee): employee is Employee => employee !== undefined)
    .sort((a, b) => (names.get(a._id) ?? '').localeCompare(names.get(b._id) ?? '', 'vi'))
  $: if (members.slice(VISIBLE_MEMBERS).some((member) => member._id === selected)) isExpanded = true
  $: shown = isExpanded ? members : members.slice(0, VISIBLE_MEMBERS)
  $: isOnPath = path.includes(node.department._id)
  $: isTarget = path[path.length - 1] === node.department._id

  function pickHead (event: MouseEvent): void {
    const hierarchy = client.getHierarchy()
    const candidates = [...people.values()]
      .map((employee) => ({ employee, name: getName(hierarchy, employee) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    showPopup(
      SelectPopup,
      {
        searchable: true,
        placeholder: str.SetHead,
        value: [
          { id: null, label: str.NoHead, isSelected: head === undefined },
          ...candidates.map(({ employee, name }) => ({
            id: employee._id,
            text: name,
            component: PersonPresenter,
            props: { value: employee, avatarSize: 'x-small', disabled: true },
            isSelected: employee._id === head?._id
          }))
        ]
      },
      eventToHTMLElement(event),
      async (teamLead: Employee['_id'] | null | undefined) => {
        if (teamLead !== undefined && teamLead !== node.department.teamLead) {
          await client.update(node.department, { teamLead })
        }
      }
    )
  }

  function addSubDepartment (): void {
    showPopup(CreateDepartment, { parent: node.department._id }, 'top')
  }
</script>

<div class="flex flex-col items-center">
  <div
    class="w-64 rounded-lg border bg-card text-[13px] transition-shadow {isOnPath ? 'border-primary/60' : ''} {isTarget
      ? 'ring-2 ring-primary/25'
      : ''}"
    data-dept={node.department._id}
  >
    <div class="flex items-start gap-1 px-1.5 pt-1.5">
      <button
        type="button"
        class="flex min-w-0 flex-1 flex-col items-stretch justify-start gap-0.5 rounded-md px-1.5 py-1 text-left hover:bg-accent"
        on:click={() => openDoc(client.getHierarchy(), node.department)}
      >
        <span class="truncate font-semibold">{node.department.name}</span>
        <span class="text-xs text-muted-foreground tabular-nums">
          <Label label={str.People} params={{ count: node.total }} />
          {#if node.children.length > 0 && node.total > 0}
            · <Label label={str.Direct} params={{ count: node.direct }} />
          {/if}
        </span>
      </button>
      <span class="inline-flex" use:tooltip={{ label: str.AddSubDepartment }}>
        <Button variant="ghost" size="icon-sm" aria-label={addLabel} onclick={addSubDepartment}>
          <Plus />
        </Button>
      </span>
    </div>
    <div class="grid gap-px px-1.5 pb-1.5">
      {#if head !== undefined}
        <div class="group flex items-center gap-1">
          <button
            type="button"
            class="person"
            class:is-selected={selected === head._id}
            on:click={() => {
              onSelect(head._id)
            }}
          >
            <PersonPresenter value={head} avatarSize={'x-small'} disabled />
            <span class="ml-auto flex shrink-0 items-center gap-2">
              {#if off.has(head._id)}
                <span class="off is-head"><Label label={str.Off} /></span>
              {/if}
              <span class="rounded bg-accent px-1.5 text-[11px] font-medium text-muted-foreground"><Label label={str.Lead} /></span>
            </span>
          </button>
          <span class="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <ButtonIcon icon={IconEdit} kind={'tertiary'} size={'small'} tooltip={{ label: str.SetHead }} on:click={pickHead} />
          </span>
        </div>
      {:else}
        <button type="button" class="person text-xs" on:click={pickHead}>
          <span class="text-muted-foreground"><Label label={str.NoHead} /> ·</span>
          <span class="font-medium"><Label label={str.SetHead} /></span>
        </button>
      {/if}
      {#if members.length > 0}
        <div class="my-1 h-px bg-border" />
        {#each shown as member (member._id)}
          <button
            type="button"
            class="person"
            class:is-selected={selected === member._id}
            on:click={() => {
              onSelect(member._id)
            }}
          >
            <PersonPresenter value={member} avatarSize={'x-small'} disabled />
            {#if off.has(member._id)}
              <span class="off ml-auto"><Label label={str.Off} /></span>
            {/if}
          </button>
        {/each}
        {#if members.length > VISIBLE_MEMBERS}
          <button
            type="button"
            class="person text-xs text-muted-foreground"
            on:click={() => {
              isExpanded = !isExpanded
            }}
          >
            {#if isExpanded}
              <Label label={str.ShowLess} />
            {:else}
              <Label label={str.MoreMembers} params={{ count: members.length - VISIBLE_MEMBERS }} />
            {/if}
          </button>
        {/if}
      {/if}
    </div>
  </div>
  {#if node.children.length > 0}
    <ul class="kids">
      {#each node.children as child (child.department._id)}
        <li class="kid"><svelte:self node={child} {people} {names} {off} {selected} {path} {onSelect} /></li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .person {
    display: flex;
    justify-content: flex-start;
    flex: 1;
    min-width: 0;
    height: 1.75rem;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.375rem;
    border-radius: 0.375rem;
    text-align: left;
  }
  .person:hover {
    background: var(--accent);
  }
  .person:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  /* A hollow dot instead of a chip, so a lead who is off doesn't read as two grey chips. */
  .off {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.25rem;
    font-size: 11px;
    color: var(--muted-foreground);
  }
  .off::before {
    content: '';
    width: 6px;
    height: 6px;
    border: 1px solid currentColor;
    border-radius: 9999px;
  }
  /* Staff need to see that the person who approves their requests is away. */
  .off.is-head {
    color: var(--foreground);
  }
  .person.is-selected {
    background: var(--accent);
    box-shadow: inset 0 0 0 1px var(--border);
  }
  /* No Tailwind preflight, so the UA ul margin and padding-left would detach and offset the stem. */
  .kids {
    position: relative;
    display: flex;
    justify-content: center;
    margin: 0;
    padding: 24px 0 0;
    list-style: none;
  }
  .kids::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    height: 24px;
    border-left: 1px solid var(--border);
  }
  .kid {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 8px 0;
  }
  .kid::before,
  .kid::after {
    content: '';
    position: absolute;
    top: 0;
    right: 50%;
    width: 50%;
    height: 24px;
    border-top: 1px solid var(--border);
  }
  .kid::after {
    right: auto;
    left: 50%;
    border-left: 1px solid var(--border);
  }
  .kid:only-child {
    padding-top: 0;
  }
  .kid:only-child::before,
  .kid:only-child::after {
    display: none;
  }
  .kid:first-child::before,
  .kid:last-child::after {
    border: 0;
  }
  .kid:last-child::before {
    border-right: 1px solid var(--border);
    border-radius: 0 4px 0 0;
  }
  .kid:first-child::after {
    border-radius: 4px 0 0 0;
  }
</style>
