<script lang="ts">
  import chunter, { type Channel } from '@hcengineering/chunter'
  import contact, { AvatarType, getCurrentEmployee } from '@hcengineering/contact'
  import { AccountRole, getCurrentAccount, type Ref } from '@hcengineering/core'
  import login from '@hcengineering/login'
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import setting, { settingId } from '@hcengineering/setting'
  import task from '@hcengineering/task'
  import tracker, { type Issue } from '@hcengineering/tracker'
  import { Analytics } from '@hcengineering/analytics'
  import { languageStore } from '@hcengineering/theme'
  import { Label, deviceOptionsStore, getCurrentResolvedLocation, location, navigate, showPopup, tooltip } from '@hcengineering/ui'
  import { Check, ChevronRight } from '@lucide/svelte'
  import { expoOut } from 'svelte/easing'
  import { fly, scale } from 'svelte/transition'
  import * as Popover from '../../../lib/components/ui/popover'
  import { coach } from '../../../onboarding/coach/coach'
  import { countDone, creatorItems, personalItems, type ChecklistItem } from '../../../onboarding/checklist/items'
  import { isSetupHidden, loadSetupHidden, markOpenedAssigned, readOpenedAssigned, setSetupHidden } from '../../../onboarding/checklist/state'

  const GENERAL_CHANNEL = 'chunter:space:General' as Ref<Channel>

  const account = getCurrentAccount()
  const me = getCurrentEmployee()
  const isOwner = account.role === AccountRole.Owner
  const client = getClient()
  const ISSUE_REFERENCE = /^[A-Za-z]+-\d+$/

  const RING_RADIUS = 8
  const RING_LENGTH = 2 * Math.PI * RING_RADIUS
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const motion = (ms: number): number => (isReducedMotion ? 0 : ms)
  const hideLabel = 'ui:string:ServoneChecklistHide' as IntlString
  const importLabel = 'ui:string:ServoneChecklistImport' as IntlString
  const progressLabel = 'ui:string:ServoneChecklistProgress' as IntlString
  const completeLabel = 'ui:string:ServoneChecklistComplete' as IntlString
  const completeHintLabel = 'ui:string:ServoneChecklistCompleteHint' as IntlString

  interface ItemCopy {
    title: IntlString
    hint: IntlString
    action: IntlString
    run: () => void | Promise<void>
  }

  const copy = (name: string): { title: IntlString, hint: IntlString, action: IntlString } => ({
    title: `ui:string:ServoneChecklist${name}` as IntlString,
    hint: `ui:string:ServoneChecklist${name}Hint` as IntlString,
    action: `ui:string:ServoneChecklist${name}Action` as IntlString
  })

  function openApp (alias: string, ...rest: string[]): void {
    const target = getCurrentResolvedLocation()
    target.path = [target.path[0], target.path[1], alias, ...rest]
    target.fragment = undefined
    target.query = undefined
    navigate(target)
  }

  async function openProfile (): Promise<void> {
    const profile = await client.findOne(setting.class.SettingsCategory, { _id: setting.ids.Profile })
    if (profile !== undefined) openApp(settingId, profile.name)
  }

  const copies: Record<string, ItemCopy> = {
    invite: { ...copy('Invite'), run: () => { showPopup(login.component.InviteLink, {}) } },
    project: { ...copy('Project'), run: () => { showPopup(tracker.component.CreateProject, {}, 'top') } },
    sprint: { ...copy('Sprint'), run: () => { openApp('tracker') } },
    managers: { ...copy('Managers'), run: () => { openApp('contact') } },
    leave: {
      ...copy('Leave'),
      run: () => {
        openApp('time')
        coach({ selector: '[data-coach="leave-request"]', message: 'ui:string:ServoneCoachLeave' as IntlString, side: 'right', align: 'start' })
      }
    },
    meeting: {
      ...copy('Meeting'),
      run: () => {
        openApp('time', 'tuan')
        coach({ selector: '[data-coach="lich-create"]', message: 'ui:string:ServoneCoachMeeting' as IntlString, side: 'bottom', align: 'end' })
      }
    },
    photo: { ...copy('Photo'), run: openProfile },
    hello: { ...copy('Hello'), run: () => { openApp('chunter', GENERAL_CHANNEL) } },
    assigned: { ...copy('Assigned'), run: () => { openApp('tracker') } }
  }

  let starters: Issue[] = []
  let isArchived = false
  let hasPhoto = false
  let hasPosted = false
  let hasAssigned = false
  let hasOpenedAssigned = readOpenedAssigned(account.uuid)
  let isOpen = false
  let title = ''
  let pillAria = ''

  loadSetupHidden(account.uuid)

  createQuery().query(tracker.class.Issue, { space: tracker.project.DefaultProject }, (found) => {
    starters = found
  })
  createQuery().query(tracker.class.Project, { _id: tracker.project.DefaultProject }, (found) => {
    isArchived = found[0]?.archived === true
  })
  createQuery().query(contact.class.Person, { _id: me }, (found) => {
    hasPhoto = found[0] !== undefined && found[0].avatarType !== AvatarType.COLOR
  })
  createQuery().query(
    chunter.class.ChatMessage,
    { space: GENERAL_CHANNEL, createdBy: { $in: account.socialIds } },
    (found) => {
      hasPosted = found.length > 0
    },
    { limit: 1 }
  )
  createQuery().query(tracker.class.Issue, { assignee: me }, (found) => {
    hasAssigned = found.length > 0
  }, { limit: 1 })

  $: isWorkbench = $location.path[0] === 'workbench'
  $: if (isWorkbench && hasAssigned && !hasOpenedAssigned) void detectOpenedAssigned($location)

  async function detectOpenedAssigned (current: typeof $location): Promise<void> {
    const tokens = [...current.path, ...(current.fragment?.split('|') ?? [])]
    const references = tokens.filter((token) => ISSUE_REFERENCE.test(token))
    const byIdentifier = references.length > 0 ? await client.findOne(tracker.class.Issue, { assignee: me, identifier: { $in: references } }) : undefined
    const byId = await client.findOne(tracker.class.Issue, { assignee: me, _id: { $in: tokens as Array<Issue['_id']> } })
    if (byIdentifier === undefined && byId === undefined) return
    markOpenedAssigned(account.uuid)
    hasOpenedAssigned = true
  }

  const isDone = (issue: Issue): boolean => client.getModel().findObject(issue.status)?.category === task.statusCategory.Won

  $: items = isOwner
    ? creatorItems(starters.map((issue) => ({ id: issue._id, title: issue.title, isDone: isDone(issue) })))
    : personalItems({ hasPhoto, hasPosted, hasAssigned, hasOpenedAssigned })
  $: done = countDone(items)
  $: isShown = isWorkbench && !$deviceOptionsStore.isMobile && !$isSetupHidden && !isArchived && items.length > 0
  $: nextKey = items.find((item) => !item.isDone)?.key
  $: isComplete = done === items.length
  $: ringOffset = items.length === 0 ? RING_LENGTH : RING_LENGTH * (1 - done / items.length)
  $: heading = `ui:string:ServoneChecklistTitle${isOwner ? '' : 'Personal'}` as IntlString
  $: translateCB(heading, {}, $languageStore, (translated) => { title = translated })
  $: translateCB(
    'ui:string:ServoneChecklistPillAria' as IntlString,
    { done, total: items.length },
    $languageStore,
    (translated) => { pillAria = translated }
  )
  $: if (!isShown) isOpen = false

  function runItem (item: ChecklistItem): void {
    isOpen = false
    void copies[item.key]?.run()
  }

  function hide (): void {
    isOpen = false
    setSetupHidden(true)
    Analytics.handleEvent('setup_hidden')
  }

  function onWindowKeydown (event: KeyboardEvent): void {
    if (!isOpen || event.key !== 'Escape') return
    event.stopPropagation()
    isOpen = false
  }
</script>

<svelte:window on:keydown|capture={onWindowKeydown} />

{#if isShown}
  <div class="setup" in:fly={{ y: 4, duration: motion(200), easing: expoOut }}>
    <Popover.Root bind:open={isOpen}>
      <span class="tip" use:tooltip={{ label: heading, direction: 'right' }}>
        <Popover.Trigger class="servone-setup-trigger" aria-label={pillAria}>
          <span class="progress" class:is-complete={isComplete} aria-hidden="true">
            <svg viewBox="0 0 20 20" width="20" height="20">
              <circle class="progress-track" cx="10" cy="10" r={RING_RADIUS} />
              <circle
                class="progress-fill"
                cx="10"
                cy="10"
                r={RING_RADIUS}
                stroke-dasharray={RING_LENGTH}
                stroke-dashoffset={ringOffset}
              />
            </svg>
            {#if isComplete}
              <span class="progress-check" in:scale={{ start: 0.6, duration: motion(180), easing: expoOut }}><Check size={10} strokeWidth={3} /></span>
            {/if}
          </span>
          <span class="count">{done}/{items.length}</span>
        </Popover.Trigger>
      </span>
      <Popover.Content side="right" align="end" sideOffset={8} class="servone-float-panel servone-setup-panel" aria-label={title}>
        <div class="servone-setup-header">
          <span class="servone-setup-title">{#if isComplete}<Label label={completeLabel} />{:else}{title}{/if}</span>
          <span class="servone-setup-progress"><Label label={progressLabel} params={{ done, total: items.length }} /></span>
        </div>
        {#if isComplete}
          <p class="servone-setup-complete"><Label label={completeHintLabel} /></p>
        {/if}
        <ul class="servone-setup-list">
          {#each items as item (item.key)}
            {@const itemCopy = copies[item.key]}
            {#if item.isDone}
              <li class="servone-setup-row is-done">
                <span class="servone-setup-mark is-done" aria-hidden="true">
                  <span in:scale={{ start: 0.6, duration: motion(180), easing: expoOut }}><Check size={10} strokeWidth={3} /></span>
                </span>
                <span class="servone-setup-item-title">
                  {#if itemCopy !== undefined}<Label label={itemCopy.title} />{:else}{item.title}{/if}
                </span>
              </li>
            {:else if item.key === nextKey && itemCopy !== undefined}
              <li class="servone-setup-next">
                <span class="servone-setup-mark is-next" aria-hidden="true"></span>
                <div class="servone-setup-next-body">
                  <span class="servone-setup-item-title strong"><Label label={itemCopy.title} /></span>
                  <span class="servone-setup-hint"><Label label={itemCopy.hint} /></span>
                  <button type="button" class="servone-setup-action primary" on:click={() => { runItem(item) }}>
                    <Label label={itemCopy.action} />
                  </button>
                </div>
              </li>
            {:else}
              <li>
                <button type="button" class="servone-setup-row is-pending" on:click={() => { runItem(item) }}>
                  <span class="servone-setup-mark" aria-hidden="true"></span>
                  <span class="servone-setup-item-title">
                    {#if itemCopy !== undefined}<Label label={itemCopy.title} />{:else}{item.title}{/if}
                  </span>
                  <span class="servone-setup-chevron" aria-hidden="true"><ChevronRight size={14} /></span>
                </button>
              </li>
            {/if}
          {/each}
        </ul>
        <div class="servone-setup-footer">
          {#if isOwner}
            <button type="button" class="servone-setup-link" on:click={() => { isOpen = false; openApp('setting', 'import') }}>
              <Label label={importLabel} />
            </button>
          {/if}
          <button type="button" class="servone-setup-action quiet" on:click={hide}>
            <Label label={hideLabel} />
          </button>
        </div>
      </Popover.Content>
    </Popover.Root>
  </div>
{/if}

<style>
  .setup {
    display: flex;
    flex-shrink: 0;
    justify-content: center;
    padding-top: 0.25rem;
  }
  .tip {
    display: inline-flex;
  }
  :global(.servone-setup-trigger) {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.125rem;
    width: 2.25rem;
    padding: 0.375rem 0 0.25rem;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--theme-navpanel-icons-color);
    cursor: pointer;
    outline: none;
    transition: color 120ms ease-out, background-color 120ms ease-out, transform 80ms ease-out;
  }
  :global(.servone-setup-trigger:hover),
  :global(.servone-setup-trigger[data-state='open']) {
    color: var(--theme-caption-color);
  }
  :global(.servone-setup-trigger[data-state='open']) {
    background-color: var(--theme-button-pressed);
  }
  :global(.servone-setup-trigger:active) {
    transform: translateY(1px);
  }
  :global(.servone-setup-trigger:focus-visible) {
    box-shadow: 0 0 0 2px var(--primary-button-outline);
  }
  .progress {
    position: relative;
    display: inline-flex;
    width: 1.25rem;
    height: 1.25rem;
  }
  .progress svg {
    transform: rotate(-90deg);
  }
  .progress circle {
    fill: none;
    stroke-width: 2.5;
  }
  .progress-track {
    stroke: color-mix(in oklch, currentColor 25%, transparent);
  }
  .progress-fill {
    stroke: var(--primary);
    stroke-linecap: round;
    transition: stroke-dashoffset 400ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .progress-check {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary);
  }
  .count {
    font-size: 0.75rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  :global(.servone-setup-panel) {
    gap: 0;
    width: min(20rem, calc(100vw - 6rem));
    padding: 0.75rem 0.75rem 0.5rem;
    border-radius: 0.75rem;
  }
  :global(.servone-setup-header) {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  :global(.servone-setup-title) {
    font-size: 0.8125rem;
    font-weight: 600;
  }
  :global(.servone-setup-progress) {
    flex: none;
    color: var(--muted-foreground);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
  :global(.servone-setup-complete) {
    margin: 0 0 0.5rem;
    color: var(--muted-foreground);
    font-size: 0.75rem;
    line-height: 1.4;
  }
  :global(.servone-setup-list) {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin: 0 -0.375rem;
    padding: 0;
    list-style: none;
  }
  :global(.servone-setup-row) {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-height: 2rem;
    padding: 0.375rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--foreground);
    font: inherit;
    text-align: left;
  }
  :global(.servone-setup-row.is-pending) {
    cursor: pointer;
    transition: background-color 120ms ease-out;
  }
  :global(.servone-setup-row.is-pending:hover) {
    background: var(--accent);
  }
  :global(.servone-setup-row.is-pending:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  :global(.servone-setup-row.is-done .servone-setup-item-title) {
    color: var(--muted-foreground);
  }
  :global(.servone-setup-next) {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.375rem;
    border-radius: 8px;
    background: color-mix(in oklch, var(--primary) 7%, transparent);
  }
  :global(.servone-setup-next-body) {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    min-width: 0;
  }
  :global(.servone-setup-mark) {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border: 1.5px solid var(--border);
    border-radius: 9999px;
  }
  :global(.servone-setup-mark.is-next) {
    margin-top: 0.0625rem;
    border-color: var(--primary);
  }
  :global(.servone-setup-mark.is-done) {
    border-color: var(--primary);
    background: var(--primary);
    color: var(--primary-foreground);
  }
  :global(.servone-setup-item-title) {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.8125rem;
    line-height: 1.35;
  }
  :global(.servone-setup-item-title.strong) {
    font-weight: 500;
  }
  :global(.servone-setup-hint) {
    color: var(--muted-foreground);
    font-size: 0.75rem;
    line-height: 1.4;
  }
  :global(.servone-setup-chevron) {
    display: inline-flex;
    flex: none;
    color: var(--muted-foreground);
    opacity: 0;
    transform: translateX(-2px);
    transition: opacity 120ms ease-out, transform 120ms ease-out;
  }
  :global(.servone-setup-row.is-pending:hover .servone-setup-mark) {
    border-color: var(--muted-foreground);
  }
  :global(.servone-setup-row.is-pending:hover .servone-setup-chevron),
  :global(.servone-setup-row.is-pending:focus-visible .servone-setup-chevron) {
    opacity: 1;
    transform: none;
  }
  :global(.servone-setup-footer) {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }
  :global(.servone-setup-link) {
    margin-right: auto;
    white-space: nowrap;
    padding: 0;
    border: none;
    background: none;
    color: var(--muted-foreground);
    font: inherit;
    font-size: 0.75rem;
    text-align: left;
    text-decoration: underline;
    text-decoration-color: color-mix(in oklch, currentColor 35%, transparent);
    text-underline-offset: 3px;
    cursor: pointer;
  }
  :global(.servone-setup-link:hover) {
    color: var(--foreground);
  }
  :global(.servone-setup-link:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: 2px;
  }
  :global(.servone-setup-action) {
    display: inline-flex;
    white-space: nowrap;
    align-items: center;
    justify-content: center;
    height: 1.875rem;
    margin-top: 0.25rem;
    padding: 0 0.75rem;
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: 0.8125rem;
    cursor: pointer;
    transition: background-color 120ms ease-out, color 120ms ease-out, transform 80ms ease-out;
  }
  :global(.servone-setup-footer .servone-setup-action) {
    margin-top: 0;
  }
  :global(.servone-setup-action:active) {
    transform: translateY(1px);
  }
  :global(.servone-setup-action:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }
  :global(.servone-setup-action.primary) {
    background: var(--primary);
    color: var(--primary-foreground);
  }
  :global(.servone-setup-action.primary:hover) {
    background: color-mix(in oklch, var(--primary) 88%, white);
  }
  :global(.servone-setup-action.quiet) {
    background: transparent;
    color: var(--muted-foreground);
  }
  :global(.servone-setup-action.quiet:hover) {
    background: var(--accent);
    color: var(--foreground);
  }
  @media (prefers-reduced-motion: reduce) {
    .progress-fill,
    :global(.servone-setup-trigger),
    :global(.servone-setup-row.is-pending),
    :global(.servone-setup-chevron),
    :global(.servone-setup-action) {
      transition: none;
    }
  }
</style>
