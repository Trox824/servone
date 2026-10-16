<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { translate, type IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import type { Issue, IssueTemplate, Milestone, Project } from '@hcengineering/tracker'
  import { DropdownLabels, Label, showPopup, themeStore } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'
  import CreateIssue from '../../components/CreateIssue.svelte'
  import { quickCreateIssue } from '../data'
  import { icon, str } from '../plugin'
  import type { IssueTypeKey } from '../setup'

  export let project: Project & { servoneDefaultTemplate?: Ref<IssueTemplate> | null }
  export let sprint: Ref<Milestone> | null
  /** New issues go into this epic (the backlog's epic filter). */
  export let epic: Issue | undefined = undefined
  /** Where it lands in the rank order: after the section's last row. */
  export let place: { prev?: string, next?: string } | undefined = undefined

  const client = getClient()
  const dispatch = createEventDispatcher<{ close: undefined, created: Ref<Issue> }>()
  const types: Array<[IssueTypeKey, IntlString]> = [
    ['story', str.Story],
    ['task', str.Task],
    ['bug', str.Bug]
  ]

  let type: IssueTypeKey = 'story'
  function pickType (id: string | undefined): void {
    if (id !== undefined) type = id as IssueTypeKey
  }
  let title = ''
  let busy = false
  let input: HTMLInputElement
  let text: Record<string, string> = {}
  $: void Promise.all(
    [...types, ['placeholder', str.IssueTitlePlaceholder] as const].map(async ([k, l]) => [k, await translate(l, {}, $themeStore.language)])
  ).then((r) => (text = Object.fromEntries(r)))

  onMount(() => input?.focus())

  async function submit (): Promise<void> {
    if (title.trim() === '' || busy) return
    if (project.servoneDefaultTemplate != null) {
      more()
      return
    }
    busy = true
    try {
      const id = await quickCreateIssue(client, project, { title, type, sprint, epic, place })
      title = ''
      dispatch('created', id)
    } finally {
      busy = false
      input?.focus()
    }
  }

  function more (): void {
    showPopup(CreateIssue, { space: project._id, milestone: sprint, parentIssue: epic, shouldSaveDraft: false, initialTitle: title }, 'top')
    dispatch('close')
  }
</script>

<div class="flex h-9 items-center gap-2 border-b bg-muted/30 px-3 text-sm">
  <span class="w-4"></span>
  <DropdownLabels
    items={types.map(([id]) => ({ id, label: text[id] ?? id }))}
    icon={icon[type]}
    kind={'ghost'}
    size={'small'}
    showDropdownIcon
    selected={type}
    on:selected={(e) => pickType(e.detail)}
  />
  <input
    bind:this={input}
    class="h-7 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
    placeholder={text.placeholder ?? ''}
    bind:value={title}
    disabled={busy}
    on:keydown={(e) => {
      if (e.key === 'Enter') void submit()
      if (e.key === 'Escape') dispatch('close')
    }}
  />
  <button type="button" class="text-xs text-muted-foreground hover:underline" on:click={more}>
    <Label label={str.MoreOptions} />
  </button>
</div>
