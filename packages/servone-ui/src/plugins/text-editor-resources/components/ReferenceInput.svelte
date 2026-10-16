<script lang="ts">
  import chunter, { type Channel } from '@hcengineering/chunter'
  import contact, { type Employee, getCurrentEmployee } from '@hcengineering/contact'
  import core, {
    type AccountUuid,
    type Class,
    type Doc,
    getCurrentAccount,
    type Markup,
    type Ref,
    type Space
  } from '@hcengineering/core'
  import { type Asset, type IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { EmptyMarkup, isEmptyMarkup, mergeKitOptions } from '@hcengineering/text'
  import textEditor, { type RefAction, type TextEditorHandler } from '@hcengineering/text-editor'
  import {
    type AnySvelteComponent,
    Button,
    type ButtonKind,
    checkAdaptiveMatching,
    deviceOptionsStore,
    IconClose,
    registerFocus,
    showPopup
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { type FocusPosition } from '@tiptap/core'
  import { type EditorView } from '@tiptap/pm/view'
  import { createEventDispatcher, getContext } from 'svelte'
  import TextEditor from './TextEditor.svelte'
  import { defaultRefActions, getModelRefActions } from './editor/actions'
  import Send from './icons/Send.svelte'
  import { type EditorKitOptions } from '../kits/editor-kit'
  import { cn } from '$lib/utils'
  import {
    collapseTeamMentions,
    departmentClass,
    expandTeamMentions,
    mentionedTeams,
    resolveTeamMembers,
    teamHandles,
    teamTargetContext,
    type TeamChoice,
    type TeamDepartment,
    type TeamTarget
  } from '$lib/team-mentions'
  import TeamNotInChannel from '../../../components/TeamNotInChannel.svelte'

  export let content: Markup = EmptyMarkup
  export let showHeader: boolean = false
  export let showActions: boolean = true
  export let showSend: boolean = true
  export let showCancel: boolean = false
  export let iconSend: Asset | AnySvelteComponent | undefined = undefined
  export let labelSend: IntlString | undefined = undefined
  export let labelCancel: IntlString | undefined = undefined
  export let kindSend: ButtonKind = 'primary'
  export let kindCancel: ButtonKind = 'ghost'
  export let haveAttachment: boolean = false
  export let placeholder: IntlString | undefined = undefined
  export let extraActions: RefAction[] = []
  export let loading: boolean = false
  export let focusable: boolean = false
  export let noborder: boolean = false
  export let boundary: HTMLElement | undefined = undefined
  export let autofocus: FocusPosition = false
  export let onPaste: ((view: EditorView, event: ClipboardEvent) => boolean) | undefined = undefined
  export let onCancel: (() => void) | undefined = undefined
  export let docClass: Ref<Class<Doc>> | undefined = undefined
  export let kitOptions: Partial<EditorKitOptions> = {}
  export let onKeyDown: ((view: EditorView, event: KeyboardEvent) => boolean) | undefined = undefined
  export let focusIndex: number = -1

  const dispatch = createEventDispatcher()
  const client = getClient()
  const teamTarget = getContext<TeamTarget | undefined>(teamTargetContext)

  let editor: TextEditor | undefined
  let isFocused = false
  let isEditorEmpty = false
  let isSending = false
  let modelActions: RefAction[] = []

  const focusRegistration = registerFocus(focusIndex, {
    focus: () => {
      if (editor?.isEditable() !== true) return false
      editor.focus()
      isFocused = true
      return true
    },
    isFocus: () => isFocused
  })

  const insertionBridge: TextEditorHandler = {
    insertText: (text) => editor?.insertText(text),
    insertEmoji: (text, image) => editor?.insertEmoji(text, image),
    insertMarkup: (markup) => editor?.insertMarkup(markup),
    insertTemplate: (_name, markup) => editor?.insertMarkup(markup),
    insertTable: (options) => editor?.insertTable(options),
    insertCodeBlock: () => editor?.insertCodeBlock(),
    insertSeparatorLine: () => editor?.insertSeparatorLine(),
    insertContent: (inserted) => editor?.insertContent(inserted),
    focus: () => editor?.focus()
  }

  export function submit (): void {
    editor?.submit()
  }

  function destinationSpace (): Ref<Space> | undefined {
    const target = teamTarget?.()
    if (target === undefined) return undefined
    return client.getHierarchy().isDerived(target._class, core.class.Space) ? (target._id as Ref<Space>) : target.space
  }

  async function findDestinationChannel (): Promise<Channel | undefined> {
    const space = destinationSpace()
    if (space === undefined) return undefined
    return await client.findOne(chunter.class.Channel, { _id: space as Ref<Channel> })
  }

  void getModelRefActions().then((actions) => {
    modelActions = actions
  })

  function buildKitOptions (
    targetDocClass: Ref<Class<Doc>> | undefined,
    overrides: Partial<EditorKitOptions>
  ): Partial<EditorKitOptions> {
    return mergeKitOptions(
      {
        emoji: true,
        dropcursor: false,
        inlineCommands: false,
        reference: { docClass: targetDocClass, multipleMentions: true },
        hooks: {
          emptyContent: {
            onChange: (isEmpty: boolean) => {
              isEditorEmpty = isEmpty
            }
          }
        }
      },
      overrides
    )
  }

  function acceptIncomingContent (incoming: Markup): void {
    const collapsed = collapseTeamMentions(incoming)
    if (collapsed !== incoming) content = collapsed
    editor?.setContent(collapsed)
  }

  function clearComposer (): void {
    content = EmptyMarkup
    editor?.clear()
  }

  function handleFocus (): void {
    isFocused = true
    if (focusIndex !== -1) focusRegistration.focusManager?.setFocus(focusRegistration.idx)
    dispatch('focus')
  }

  function handleBlur (): void {
    isFocused = false
    dispatch('blur')
  }

  function handleUpdate (event: CustomEvent<Markup>): void {
    dispatch('update', event.detail)
  }

  function handleSubmitted (event: CustomEvent<Markup>): void {
    if (!canSend || isSending) return
    void startSend(event.detail)
  }

  async function startSend (markup: Markup): Promise<void> {
    isSending = true
    try {
      const expanded = await expandForTeams(markup)
      if (expanded === undefined) return
      dispatch('message', expanded)
      clearComposer()
    } finally {
      isSending = false
    }
  }

  function askTeamChoice (count: number, handle: string, canAdd: boolean): Promise<TeamChoice | undefined> {
    return new Promise((resolve) => {
      showPopup(TeamNotInChannel, { count, handle, canAdd }, undefined, (answer: TeamChoice | undefined) => {
        resolve(answer)
      })
    })
  }

  async function expandForTeams (markup: Markup): Promise<Markup | undefined> {
    const teams = mentionedTeams(markup)
    if (teams.length === 0) return markup

    const departments: TeamDepartment[] = await client.findAll(departmentClass, {})
    const activeEmployees = await client.findAll(contact.mixin.Employee, { active: true })
    const activeIds = new Set(activeEmployees.map((employee) => employee._id))
    const sender = getCurrentEmployee()
    const peopleByTeam = new Map(
      teams.map((team) => [team, resolveTeamMembers(team, departments, { active: activeIds, sender })] as const)
    )

    const leftOut = new Set<Ref<Doc>>()
    const channel = await findDestinationChannel()
    if (channel?.private === true) {
      const employeeById = new Map<Ref<Doc>, Employee>(
        activeEmployees.map((employee) => [employee._id, employee] as const)
      )
      const everyone = new Set([...peopleByTeam.values()].flat())
      const missingPeople: Array<Ref<Doc>> = []
      const missingAccounts: AccountUuid[] = []
      for (const person of everyone) {
        const accountUuid = employeeById.get(person)?.personUuid
        if (accountUuid !== undefined && !channel.members.includes(accountUuid)) {
          missingPeople.push(person)
          missingAccounts.push(accountUuid)
        }
      }
      if (missingPeople.length > 0) {
        const handles = teamHandles(departments)
        const handle = teams.map((team) => handles.get(team) ?? '').join(', @')
        const canAdd = !channel.archived && channel.members.includes(getCurrentAccount().uuid)
        const choice = await askTeamChoice(missingPeople.length, handle, canAdd)
        if (choice === undefined) return undefined
        if (choice === 'add') {
          await client.update(channel, { $push: { members: { $each: missingAccounts } } })
        } else {
          missingPeople.forEach((person) => leftOut.add(person))
        }
      }
    }

    return expandTeamMentions(markup, (team) => (peopleByTeam.get(team) ?? []).filter((person) => !leftOut.has(person)))
  }

  function runAction (action: RefAction, event: MouseEvent): void {
    if (action.disabled === true) return
    void action.action(event.target as HTMLElement, insertionBridge)
  }

  $: acceptIncomingContent(content)
  $: isEmpty = isEditorEmpty || isEmptyMarkup(content)
  $: canSend = (haveAttachment || !isEmpty) && !loading
  $: mergedKitOptions = buildKitOptions(docClass, kitOptions)
  $: actions = [...defaultRefActions, ...extraActions, ...modelActions].sort((first, second) => first.order - second.order)
  $: isNarrow = checkAdaptiveMatching($deviceOptionsStore.size, 'sm')
  $: groupGap = isNarrow ? 'gap-0.5' : 'gap-1'
</script>

<div
  class={cn(
    'ref-container flex min-h-10 flex-col rounded-lg border border-input bg-background shadow-xs transition-[color,box-shadow]',
    !noborder && 'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
    noborder && 'noborder border-0 shadow-none',
    focusable && 'focusable'
  )}
>
  {#if showHeader && $$slots.header}
    <div class="header border-b border-border px-3 py-1.5">
      <slot name="header" />
    </div>
  {/if}
  <div class="text-input min-h-11 overflow-auto px-3 py-2 text-sm">
    <TextEditor
      bind:content
      bind:this={editor}
      {autofocus}
      {boundary}
      {onPaste}
      placeholder={placeholder ?? textEditor.string.EditorPlaceholder}
      {onKeyDown}
      kitOptions={mergedKitOptions}
      on:focus={handleFocus}
      on:blur={handleBlur}
      on:update={handleUpdate}
      on:content={handleSubmitted}
    />
  </div>
  {#if showActions || showSend}
    <div class="buttons-panel flex min-w-0 shrink-0 items-center justify-between px-1.5 pb-1.5 pt-0.5">
      {#if showActions}
        <div class={cn('flex items-center', groupGap)}>
          {#each actions as action, position (action.label + position)}
            {#if position > 0 && action.order % 10 === 0}
              <div class="mx-1 h-4 w-px shrink-0 bg-border"></div>
            {/if}
            <Button
              kind="ghost"
              size="small"
              icon={action.icon}
              iconProps={{ size: 'small' }}
              showTooltip={{ label: action.label }}
              disabled={action.disabled}
              noFocus
              on:click={(event) => {
                runAction(action, event)
              }}
            />
          {/each}
        </div>
      {:else}
        <span></span>
      {/if}
      {#if showSend && showCancel}
        <div class={cn('flex items-center', groupGap)}>
          <Button
            {loading}
            icon={IconClose}
            kind={kindCancel}
            size="small"
            iconProps={{ size: 'small' }}
            showTooltip={{ label: labelCancel ?? view.string.Cancel }}
            on:click={() => onCancel?.()}
          />
          <Button
            {loading}
            disabled={!canSend}
            icon={iconSend ?? Send}
            kind={kindSend}
            size="small"
            iconProps={{ size: 'small' }}
            showTooltip={{ label: labelSend ?? textEditor.string.Send }}
            on:click={submit}
          />
        </div>
      {:else if showSend}
        <Button
          {loading}
          disabled={!canSend}
          icon={iconSend ?? Send}
          kind={kindSend}
          size="small"
          iconProps={{ size: 'small' }}
          showTooltip={{ label: labelSend ?? textEditor.string.Send }}
          on:click={submit}
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .text-input :global(.text-editor-view p.is-editor-empty:first-child::before),
  .ref-container:focus-within .text-input :global(.text-editor-view p.is-editor-empty:first-child::before) {
    color: var(--muted-foreground);
  }
</style>
