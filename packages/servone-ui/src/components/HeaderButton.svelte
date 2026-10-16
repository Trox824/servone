<script lang="ts">
  import { checkPermission, getCurrentAccount, hasAccountRole, type Client, type TxOperations } from '@hcengineering/core'
  import { IconAdd, IconDropdown, Loading, type HeaderButtonAction } from '../original'
  import Button from './Button.svelte'
  import ButtonWithDropdown from './ButtonWithDropdown.svelte'

  type ActionId = number | string | null

  export let mainActionId: ActionId = null
  export let loading: boolean = false
  export let client: TxOperations & Client
  export let actions: HeaderButtonAction[] = []
  export let visibleActions: ActionId[] = []

  let entitledActions: HeaderButtonAction[] = []
  let latestPass = 0

  async function isEntitled (action: HeaderButtonAction): Promise<boolean> {
    const isUnrestricted = action.accountRole === undefined && action.permissions === undefined
    const hasRole = action.accountRole !== undefined && hasAccountRole(getCurrentAccount(), action.accountRole)
    if (isUnrestricted || hasRole) return true
    const grants = await Promise.all((action.permissions ?? []).map(async (entry) => await checkPermission(client, entry.id, entry.space)))
    return grants.some((isGranted) => isGranted)
  }

  async function settleKeyBinding (action: HeaderButtonAction): Promise<void> {
    if (action.keyBindingPromise !== undefined) action.keyBinding = await action.keyBindingPromise
  }

  async function resolveEntitled (candidates: HeaderButtonAction[]): Promise<void> {
    const pass = ++latestPass
    try {
      const verdicts = await Promise.all(
        candidates.map(async (action) => {
          const [isAllowed] = await Promise.all([isEntitled(action), settleKeyBinding(action)])
          return isAllowed
        })
      )
      if (pass !== latestPass) return
      entitledActions = candidates.filter((_, position) => verdicts[position])
    } catch {}
  }

  $: void resolveEntitled(actions)

  $: offeredActions = entitledActions.filter((action) => visibleActions.includes(action.id))
  $: featuredAction = offeredActions.find((action) => action.id === mainActionId) ?? offeredActions[0]
  $: displayState =
    featuredAction === undefined ? 'empty' : loading ? 'loading' : offeredActions.length > 1 ? 'split' : 'single'
  $: featuredButtonId = featuredAction?.id == null ? undefined : String(featuredAction.id).replaceAll(':', '-')

  function runSelected (selectedId: ActionId): void {
    offeredActions.find((action) => action.id === selectedId)?.callback()
  }
</script>

{#if displayState === 'loading'}
  <Loading shrink />
{:else if displayState === 'single' && featuredAction !== undefined}
  <div class="antiNav-subheader">
    <Button
      kind={'primary'}
      justify={'left'}
      width={'100%'}
      icon={IconAdd}
      label={featuredAction.label}
      showTooltip={{ label: featuredAction.label, direction: 'bottom', keys: featuredAction.keyBinding }}
      on:click={featuredAction.callback}
    >
      <svelte:fragment slot="content">
        {#if featuredAction.draft === true}
          <div class="ml-auto pr-3"><div class="draft-circle size-1.5 rounded-full bg-[var(--primary-bg-color)]"></div></div>
        {/if}
      </svelte:fragment>
    </Button>
  </div>
{:else if displayState === 'split' && featuredAction !== undefined}
  <div class="antiNav-subheader">
    <ButtonWithDropdown
      kind={'primary'}
      justify={'left'}
      icon={IconAdd}
      label={featuredAction.label}
      dropdownIcon={IconDropdown}
      dropdownItems={offeredActions}
      mainButtonId={featuredButtonId}
      showTooltipMain={{ label: featuredAction.label, direction: 'bottom', keys: featuredAction.keyBinding }}
      on:click={featuredAction.callback}
      on:dropdown-selected={(event) => { runSelected(event.detail) }}
    >
      <svelte:fragment slot="content">
        {#if featuredAction.draft === true}
          <div class="ml-auto pr-3"><div class="draft-circle size-1.5 rounded-full bg-[var(--primary-bg-color)]"></div></div>
        {/if}
      </svelte:fragment>
    </ButtonWithDropdown>
  </div>
{/if}
