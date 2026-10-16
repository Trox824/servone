<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { getClient } from '@hcengineering/presentation'
  import setting, { settingId } from '@hcengineering/setting'
  import {
    Icon,
    IconArrowLeft,
    Label,
    ListView,
    Scroller,
    capitalizeFirstLetter,
    closePopup,
    formatKey,
    getCurrentResolvedLocation,
    navigate,
    topSP
  } from '@hcengineering/ui'
  import view, { type Action, type ActionCategory } from '@hcengineering/view'
  import { WorkbenchEvents } from '@hcengineering/workbench'
  import type { IntlString } from '@hcengineering/platform'
  import { CalendarCheck, ListChecks } from '@lucide/svelte'
  import { isSetupHidden, setSetupHidden } from '../../../onboarding/checklist/state'
  import workbench from '../plugin'
  import RightArrowIcon from './icons/Collapsed.svelte'
  import KeyboardIcon from './icons/Keyboard.svelte'

  let isShortcutsViewOpen = false
  let shortcutCategories: ActionCategory[] = []
  let listedActions: Action[] = []
  let highlightedIndex = 0

  function buildListedActions (allActions: Action[]): Action[] {
    const isOpenOrDelete = (action: Action): boolean =>
      action.label === view.string.Open || action.label === view.string.Delete
    const generalOpen = allActions.find(
      (action) => action.label === view.string.Open && action.category === view.category.General
    )
    const generalDelete = allActions.find(
      (action) => action.label === view.string.Delete && action.category === view.category.General
    )
    const pinnedActions = [generalOpen, generalDelete].filter((action): action is Action => action !== undefined)
    const boundActions = allActions.filter(
      (action) => (action.keyBinding?.length ?? 0) > 0 && !isOpenOrDelete(action)
    )
    return [...pinnedActions, ...boundActions].sort((first, second) =>
      String(first.category).localeCompare(String(second.category))
    )
  }

  const presentationClient = getClient()
  void presentationClient.findAll(view.class.ActionCategory, {}).then((found) => {
    shortcutCategories = found
  })
  void presentationClient.findAll(view.class.Action, {}).then((found) => {
    listedActions = buildListedActions(found)
  })

  function findHeaderLabel (
    index: number,
    actions: Action[],
    categories: ActionCategory[]
  ): ActionCategory['label'] | undefined {
    const currentCategory = categories.find((category) => category._id === actions[index]?.category)
    if (currentCategory?.label === undefined) return undefined
    if (index === 0) return currentCategory.label
    if (actions[index - 1].category === actions[index].category) return undefined
    const previousCategory = categories.find((category) => category._id === actions[index - 1].category)
    return previousCategory?.label === currentCategory.label ? undefined : currentCategory.label
  }

  function openWorkspaceSettings (): void {
    closePopup()
    const location = getCurrentResolvedLocation()
    location.path[2] = settingId
    location.path[3] = settingId
    location.path.length = 4
    navigate(location)
  }

  const SETUP_CALL_URL = 'mailto:support@servone.app?subject=Servone%20setup%20call'
  const setupLabel = 'ui:string:ServoneChecklistHelpSetup' as IntlString
  const setupHint = 'ui:string:ServoneChecklistHelpSetupHint' as IntlString
  const callLabel = 'ui:string:ServoneChecklistHelpCall' as IntlString
  const callHint = 'ui:string:ServoneChecklistHelpCallHint' as IntlString

  function showSetupChecklist (): void {
    closePopup()
    setSetupHidden(false)
  }

  function openShortcuts (): void {
    isShortcutsViewOpen = true
    Analytics.handleEvent(WorkbenchEvents.KeyboardShortcutsOpened)
  }
</script>

<div class="helpAndSupportPopup">
  {#if isShortcutsViewOpen}
    <div class="header">
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="back-arrow"
        on:click={() => {
          isShortcutsViewOpen = false
        }}
      >
        <Icon icon={IconArrowLeft} size={'medium'} fill={'var(--content-color)'} />
      </div>
      <span class="fs-title overflow-label"><Label label={workbench.string.KeyboardShortcuts} /></span>
    </div>
    <Scroller padding={'0 .5rem'} fade={topSP} noStretch checkForHeaders>
      <ListView count={listedActions.length} noScroll addClass={'rounded'} bind:selection={highlightedIndex}>
        <svelte:fragment slot="category" let:item>
          {@const headerLabel = findHeaderLabel(item, listedActions, shortcutCategories)}
          {#if headerLabel !== undefined}
            <div class="categoryHeader clear-mins section-title">
              <Label label={headerLabel} />
            </div>
          {/if}
        </svelte:fragment>
        <svelte:fragment slot="item" let:item>
          {@const shortcutAction = listedActions[item]}
          <div class="shortcut-row">
            <div class="shortcut-icon {item === highlightedIndex ? 'caption-color' : 'dark-color'}">
              <Icon icon={shortcutAction.icon ?? IconArrowLeft} size={'small'} />
            </div>
            <span class="grow {item === highlightedIndex ? 'caption-color' : 'content-color'}">
              <Label label={shortcutAction.label} />
            </span>
            <div class="key-area">
              {#each shortcutAction.keyBinding ?? [] as binding, bindingIndex}
                {#if bindingIndex > 0}
                  <span class="word-or"><Label label={view.string.Or} /></span>
                {/if}
                {#each formatKey(binding) as step, stepIndex}
                  {#if stepIndex > 0}
                    <span class="word-then"><Label label={view.string.Then} /></span>
                  {/if}
                  {#each step as key}
                    <span class="key-chip">{capitalizeFirstLetter(key.trim())}</span>
                  {/each}
                {/each}
              {/each}
            </div>
          </div>
        </svelte:fragment>
      </ListView>
    </Scroller>
  {:else}
    <div class="header">
      <span class="fs-title overflow-label"><Label label={workbench.string.HelpCenter} /></span>
    </div>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="help-card clear-mins cursor-pointer focused-button" on:click={openWorkspaceSettings}>
      <div class="help-card-row">
        <div class="help-card-glyph">
          <Icon icon={view.icon.Setting} size={'small'} fill={'var(--content-color)'} />
        </div>
        <div class="help-card-text">
          <div class="fs-title"><Label label={setting.string.Settings} /></div>
          <div class="text-sm content-dark-color"><Label label={workbench.string.AccessWorkspaceSettings} /></div>
        </div>
        <div class="help-card-chevron">
          <Icon icon={RightArrowIcon} size={'small'} />
        </div>
      </div>
    </div>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="help-card clear-mins cursor-pointer focused-button" on:click={openShortcuts}>
      <div class="help-card-row">
        <div class="help-card-glyph">
          <Icon icon={KeyboardIcon} size={'small'} fill={'var(--content-color)'} />
        </div>
        <div class="help-card-text">
          <div class="fs-title"><Label label={workbench.string.KeyboardShortcuts} /></div>
          <div class="text-sm content-dark-color"><Label label={workbench.string.HowToWorkFaster} /></div>
        </div>
        <div class="help-card-chevron">
          <Icon icon={RightArrowIcon} size={'small'} />
        </div>
      </div>
    </div>
    {#if $isSetupHidden}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="help-card clear-mins cursor-pointer focused-button" on:click={showSetupChecklist}>
      <div class="help-card-row">
        <div class="help-card-glyph"><ListChecks size={16} /></div>
        <div class="help-card-text">
          <div class="fs-title"><Label label={setupLabel} /></div>
          <div class="text-sm content-dark-color"><Label label={setupHint} /></div>
        </div>
      </div>
    </div>
    {/if}
    <a class="help-card clear-mins cursor-pointer focused-button" href={SETUP_CALL_URL}>
      <div class="help-card-row">
        <div class="help-card-glyph"><CalendarCheck size={16} /></div>
        <div class="help-card-text">
          <div class="fs-title"><Label label={callLabel} /></div>
          <div class="text-sm content-dark-color"><Label label={callHint} /></div>
        </div>
      </div>
    </a>
    <div class="grow"></div>
  {/if}
</div>

<style>
  .back-arrow {
    margin-right: 1rem;
    cursor: pointer;
  }
  .help-card {
    margin: 1rem 1rem 0;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.75rem;
  }
  a.help-card {
    display: block;
    color: inherit;
    text-decoration: none;
  }
  .help-card-row {
    display: flex;
    width: 100%;
    padding: 1rem;
  }
  .help-card-glyph {
    flex-shrink: 0;
    align-self: flex-start;
  }
  .help-card-text {
    width: 100%;
    padding: 0 10px;
  }
  .help-card-chevron {
    flex-shrink: 0;
    align-self: center;
  }
  .shortcut-row {
    display: flex;
    flex-grow: 1;
    align-items: center;
    justify-content: space-between;
    margin-left: 0.5rem;
    padding: 0.75rem;
    font-size: 1rem;
  }
  .shortcut-icon {
    margin-right: 1rem;
  }
  .key-area {
    display: flex;
    align-items: center;
    margin-right: 0.5rem;
    font-size: 0.875rem;
  }
  .word-or {
    margin: 0 0.5rem;
    text-transform: lowercase;
  }
  .word-then {
    margin: 0 0.25rem;
    text-transform: lowercase;
  }
  .key-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    padding: 0 0.5rem;
    font-size: 0.75rem;
    color: var(--theme-caption-color);
    background-color: var(--theme-button-default);
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.25rem;
  }
  .key-chip + .key-chip {
    margin-left: 0.5rem;
  }
  .section-title {
    position: sticky;
    top: 0;
    min-height: 2.5rem;
    padding: 0.5rem 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-caption-color);
    background-color: var(--theme-comp-header-color);
    border-radius: 0.25rem;
  }
</style>
