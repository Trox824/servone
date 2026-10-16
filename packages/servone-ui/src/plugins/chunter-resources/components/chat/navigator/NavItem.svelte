<script lang="ts">
  import {
    type Action,
    ActionIcon,
    type AnySvelteComponent,
    Icon,
    IconMoreH,
    type IconSize,
    Menu,
    showPopup,
    themeStore,
    NavItem as SharedNavItem
  } from '@hcengineering/ui'
  import { translate, type Asset, type IntlString } from '@hcengineering/platform'
  import { intl } from '../../../../../lib/intl'

  type RowIconProps = Record<string, string | number | boolean | object | undefined>

  export let _id: string
  export let icon: Asset | AnySvelteComponent | undefined
  export let iconProps: RowIconProps | undefined = undefined
  export let iconSize: IconSize = 'small'
  export let withIconBackground: boolean = true
  export let isSelected: boolean = false
  // svelte-ignore export_let_unused
  export let isSecondary: boolean = false
  export let count: number | null = null
  export let secondaryNotifyMarker: boolean = false
  export let title: string | undefined = undefined
  export let intlTitle: IntlString | undefined = undefined
  export let description: string | undefined = undefined
  export let actions: Action[] = []
  export let elementsCount: number = 0
  export let type: 'type-link' | 'type-tag' | 'type-anchor-link' | 'type-object' = 'type-link'

  const moreActionsLabel = intl('view:string:MoreActions' as IntlString)

  let isMenuOpen = false
  let inlineLabels: string[] = []

  $: inlineActions = actions.filter((action) => action.inline === true)
  $: menuActions = actions.filter((action) => action.inline !== true)
  $: neutralCount = elementsCount > 0 ? elementsCount : null
  $: unreadLabel = count !== null && count > 99 ? '99+' : String(count)
  $: void translateInlineLabels(inlineActions, $themeStore.language)

  async function translateInlineLabels (shown: Action[], language: string): Promise<void> {
    inlineLabels = await Promise.all(shown.map(async (action) => await translate(action.label, action.labelParams ?? {}, language)))
  }

  function runInlineAction (action: Action, event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    void action.action([], event)
  }

  function openMoreMenu (event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    isMenuOpen = true
    showPopup(Menu, { actions: menuActions, ctx: _id }, event.currentTarget as HTMLElement, () => {
      isMenuOpen = false
    })
  }
</script>

<SharedNavItem
  {_id}
  {icon}
  {iconProps}
  {iconSize}
  {title}
  {description}
  {type}
  label={intlTitle}
  selected={isSelected}
  withBackground={withIconBackground}
  count={neutralCount}
  showMenu={isMenuOpen}
  on:click
  on:contextmenu
>
  <svelte:fragment slot="actions">
    {#each inlineActions as action, index}
      <button
        type="button"
        aria-label={inlineLabels[index]}
        data-menu-open={isMenuOpen}
        class="inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground data-[menu-open=true]:bg-sidebar-accent data-[menu-open=true]:text-foreground"
        on:click={(event) => {
          runInlineAction(action, event)
        }}
      >
        <Icon icon={action.icon ?? ActionIcon} size={'small'} />
      </button>
    {/each}
    {#if menuActions.length > 0}
      <button
        type="button"
        data-menu-open={isMenuOpen}
        class="inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground data-[menu-open=true]:bg-sidebar-accent data-[menu-open=true]:text-foreground"
        aria-label={$moreActionsLabel}
        on:click={openMoreMenu}
      >
        <IconMoreH size={'small'} />
      </button>
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="notify">
    {#if count !== null && count > 0}
      <span
        class="ml-2 inline-flex h-[1.125rem] min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-semibold leading-none tabular-nums text-primary-foreground"
      >
        {unreadLabel}
      </span>
    {:else if secondaryNotifyMarker}
      <span class="ml-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
    {/if}
  </svelte:fragment>
</SharedNavItem>
