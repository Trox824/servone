<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import contact, { formatName, getCurrentEmployee, isWorkspaceMemberStatusVisible } from '@hcengineering/contact'
  import {
    loadWorkspaceMemberStatuses,
    myEmployeeStore,
    workspaceMemberStatusByAccountStore
  } from '@hcengineering/contact-resources'
  import contactResources from '@hcengineering/contact-resources/src/plugin'
  import core, { AccountRole, getCurrentAccount, hasAccountRole, SocialIdType, SortingOrder } from '@hcengineering/core'
  import login, { loginId } from '@hcengineering/login'
  import { getMetadata, getResource, type IntlString } from '@hcengineering/platform'
  import presentation, { createQuery, getCurrentWorkspaceUrl, hasResource, isDisabled } from '@hcengineering/presentation'
  import rating, { type PersonRating } from '@hcengineering/rating'
  import setting, { RoleCapability, settingId, type SettingsCategory } from '@hcengineering/setting'
  import {
    closePopup,
    Component,
    deviceOptionsStore,
    getCurrentResolvedLocation,
    Icon,
    Label,
    locationToUrl,
    navigate,
    resizeObserver,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { allowGuestSignUpStore } from '@hcengineering/view-resources'
  import { ArrowLeftRight, CircleQuestionMark, LogIn, LogOut, Moon, Settings, Smile, SunMoon, UserPlus } from '@lucide/svelte'
  import { createEventDispatcher, onMount } from 'svelte'
  import SettingsPopup from '../../../components/internal/SettingsPopup.svelte'
  import PausePopup from '../../../components/notify/PausePopup.svelte'
  import { menuItemClass, menuPopupClass, menuSeparatorClass } from '../../../lib/menu-classes'
  import { formatPauseTime, minuteClock, pauseString, pausedUntilStore } from '../../../lib/notify/pause'
  import workbench from '../plugin'
  import { logOut } from '../utils'
  import HelpAndSupport from './HelpAndSupport.svelte'

  interface AccountEntry {
    key: string
    label: IntlString
    labelParams?: { time: string }
    group: string | undefined
    glyph?: typeof Settings
    category?: SettingsCategory
    run: () => void | Promise<void>
  }

  const dispatch = createEventDispatcher()

  const currentAccount = getCurrentAccount()
  const accountEmail = currentAccount.fullSocialIds.find(
    (socialId) => socialId.type === SocialIdType.EMAIL && socialId.isDeleted !== true
  )?.value
  const isDocGuest = hasAccountRole(currentAccount, AccountRole.DocGuest)
  const isUser = hasAccountRole(currentAccount, AccountRole.User)
  const isReadOnlyGuest = currentAccount.role === AccountRole.ReadOnlyGuest
  const isRatingInstalled = hasResource(rating.component.RatingRing)

  let rootElement: HTMLDivElement
  let loadedCategories: SettingsCategory[] = []
  let canGenerateInvite = false
  let personRating: PersonRating | undefined

  createQuery().query(
    setting.class.SettingsCategory,
    {},
    (found) => {
      loadedCategories = found.filter((category) => hasAccountRole(currentAccount, category.role))
    },
    { sort: { order: SortingOrder.Ascending } }
  )
  createQuery().query(rating.class.PersonRating, { accountId: currentAccount.uuid }, (found) => {
    personRating = found[0]
  })

  onMount(() => {
    rootElement.focus()
    void loadWorkspaceMemberStatuses()
    void getResource(setting.function.HasRoleCapability).then(async (hasRoleCapability) => {
      canGenerateInvite = await hasRoleCapability(RoleCapability.GenerateInviteLink)
    })
  })

  $: ownStatus = $workspaceMemberStatusByAccountStore.get(currentAccount.uuid)
  $: statusLabel = isWorkspaceMemberStatusVisible(ownStatus)
    ? contactResources.string.WorkspaceStatusUpdateYour
    : contactResources.string.WorkspaceStatusSetYour
  $: isPauseActive = $pausedUntilStore !== undefined && $minuteClock < $pausedUntilStore
  $: pauseEndText =
    $pausedUntilStore !== undefined && isPauseActive
      ? formatPauseTime($pausedUntilStore, $minuteClock, $themeStore.language)
      : ''
  $: isPhonePortrait = $deviceOptionsStore.isMobile && $deviceOptionsStore.isPortrait
  $: menuPosition = isPhonePortrait ? 'account-portrait' : 'account'
  $: isCurrentEmployeeSystem = getCurrentEmployee() === core.employee.System

  $: accountEntries = buildEntries(
    loadedCategories,
    statusLabel,
    isPauseActive,
    pauseEndText,
    canGenerateInvite,
    $allowGuestSignUpStore,
    menuPosition
  )

  function openSettings (category?: SettingsCategory): void {
    closePopup()
    const location = getCurrentResolvedLocation()
    location.fragment = undefined
    location.query = undefined
    location.path[2] = settingId
    if (category !== undefined) {
      location.path[3] = category.name
      location.path.length = 4
    } else {
      location.path.length = 3
    }
    navigate(location)
  }

  function categoryHref (category: SettingsCategory): string {
    const location = getCurrentResolvedLocation()
    location.path[2] = settingId
    location.path[3] = category.name
    location.path.length = 4
    return locationToUrl(location)
  }

  function openWorkspaceSelection (): void {
    closePopup()
    const location = getCurrentResolvedLocation()
    location.fragment = undefined
    location.query = undefined
    location.path = [loginId, 'selectWorkspace']
    navigate(location)
  }

  async function signOut (): Promise<void> {
    await logOut()
    navigate({ path: [loginId] })
    Analytics.handleEvent('workbench.SignOut')
    Analytics.logout()
  }

  function buildEntries (
    categories: SettingsCategory[],
    statusText: IntlString,
    isPaused: boolean,
    pausedUntilText: string,
    canInvite: boolean,
    isGuestSignUpAllowed: boolean,
    popupPosition: string
  ): AccountEntry[] {
    const leadingEntries: Array<AccountEntry | undefined> = [
      isDocGuest
        ? { key: 'settings', label: setting.string.Settings, group: undefined, glyph: Settings, run: () => { openSettings() } }
        : undefined,
      isUser
        ? {
            key: 'status',
            label: statusText,
            group: undefined,
            glyph: Smile,
            run: () => {
              closePopup()
              showPopup(contact.component.WorkspaceMemberStatusEditor, {}, 'middle')
            }
          }
        : undefined,
      isUser
        ? {
            key: 'pause',
            label: isPaused ? pauseString.PausedUntil : pauseString.PauseNotifications,
            labelParams: isPaused ? { time: pausedUntilText } : undefined,
            group: undefined,
            glyph: Moon,
            run: () => {
              closePopup()
              showPopup(PausePopup, {}, popupPosition)
            }
          }
        : undefined,
      {
        key: 'appearance',
        label: 'setting:string:ServoneAppearance' as IntlString,
        group: undefined,
        glyph: SunMoon,
        run: () => {
          closePopup()
          showPopup(SettingsPopup, {}, popupPosition)
        }
      }
    ]
    const categoryEntries: AccountEntry[] = categories
      .filter(
        (category) =>
          category.group === 'main' && category._id !== setting.ids.Profile && category._id !== setting.ids.Password
      )
      .map((category) => ({
        key: `category-${category._id}`,
        label: category.label,
        group: category.group,
        category,
        run: () => { openSettings(category) }
      }))
    const trailingEntries: Array<AccountEntry | undefined> = [
      isUser && !isDisabled('invites') && canInvite
        ? {
            key: 'invite',
            label: setting.string.InviteWorkspace,
            group: 'end',
            glyph: UserPlus,
            run: () => { showPopup(login.component.InviteLink, {}) }
          }
        : undefined,
      isUser
        ? {
            key: 'workspace',
            label: setting.string.SelectWorkspace,
            group: 'end',
            glyph: ArrowLeftRight,
            run: openWorkspaceSelection
          }
        : undefined,
      {
        key: 'help',
        label: workbench.string.HelpAndSupport,
        group: 'end',
        glyph: CircleQuestionMark,
        run: () => { showPopup(HelpAndSupport, {}, 'help-center') }
      },
      isReadOnlyGuest && isGuestSignUpAllowed
        ? {
            key: 'join',
            label: view.string.ReadOnlyJoinWorkspace,
            group: 'end',
            glyph: UserPlus,
            run: () => {
              navigate({ path: ['login', 'join'], query: { workspace: getCurrentWorkspaceUrl() } })
            }
          }
        : undefined,
      isReadOnlyGuest
        ? {
            key: 'signup',
            label: view.string.ReadOnlySignUp,
            group: 'end',
            glyph: LogIn,
            run: () => { window.open(getMetadata(presentation.metadata.SignupUrl), '_blank') }
          }
        : undefined,
      {
        key: 'signout',
        label: isDocGuest ? setting.string.Signout : login.string.LogIn,
        group: 'signout',
        glyph: isDocGuest ? LogOut : LogIn,
        run: signOut
      }
    ]
    const isDefined = (entry: AccountEntry | undefined): entry is AccountEntry => entry !== undefined
    return [...leadingEntries.filter(isDefined), ...categoryEntries, ...trailingEntries.filter(isDefined)]
  }

  function openProfile (): void {
    const profileCategory = loadedCategories.find((category) => category._id === setting.ids.Profile)
    if (profileCategory !== undefined) openSettings(profileCategory)
  }

  function activateEntry (entry: AccountEntry): void {
    if (entry.category === undefined) dispatch('close')
    void entry.run()
  }

  function activateCategoryEntry (event: MouseEvent, entry: AccountEntry): void {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    void entry.run()
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Tab') return
    const rows = Array.from(rootElement.querySelectorAll<HTMLButtonElement>('button[data-account-row]'))
    if (rows.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Tab') {
      dispatch('close')
      return
    }
    const focusedIndex = rows.findIndex((row) => row === document.activeElement)
    if (event.key === 'ArrowDown') {
      rows[focusedIndex < 0 ? 0 : (focusedIndex + 1) % rows.length].focus()
    } else {
      rows[focusedIndex < 0 ? rows.length - 1 : (focusedIndex - 1 + rows.length) % rows.length].focus()
    }
  }

  const profileRowClass =
    'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-accent focus:bg-accent max-[480px]:min-h-11'
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  bind:this={rootElement}
  class="servone-account-sheet {menuPopupClass} w-60 outline-none max-[480px]:w-full"
  class:self-end={isPhonePortrait}
  tabindex="-1"
  use:resizeObserver={() => { dispatch('changeContent') }}
  on:keydown={handleKeydown}
>
  <button class={profileRowClass} data-account-row on:click={openProfile}>
    {#if isCurrentEmployeeSystem}
      <span class="truncate text-sm font-medium"><Label label={core.string.System} /></span>
    {:else if $myEmployeeStore !== undefined}
      <Component
        is={contact.component.Avatar}
        props={{ person: $myEmployeeStore, size: 'small', name: $myEmployeeStore.name }}
      />
      <div class="flex min-w-0 grow flex-col">
        <span class="truncate text-sm font-medium text-foreground">{formatName($myEmployeeStore.name)}</span>
        {#if accountEmail !== undefined}
          <span class="truncate text-xs text-muted-foreground">{accountEmail}</span>
        {/if}
        {#if isRatingInstalled}
          <div class="flex items-center text-xs">
            <Component
              is={rating.component.RatingRing}
              props={{ rating: personRating?.rating ?? 0, showValues: true }}
            />
          </div>
        {/if}
      </div>
    {/if}
  </button>
  <div class={menuSeparatorClass}></div>
  {#each accountEntries as entry, entryIndex (entry.key)}
    {#if entryIndex > 0 && accountEntries[entryIndex - 1].group !== entry.group}
      <div class={menuSeparatorClass}></div>
    {/if}
    {#if entry.category !== undefined}
      <a class="block text-inherit no-underline" href={categoryHref(entry.category)}>
        <button
          class="{menuItemClass} max-[480px]:min-h-11"
          data-account-row
          on:click={(event) => { activateCategoryEntry(event, entry) }}
        >
          <span class="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
            <Icon icon={entry.category.icon} size={'small'} />
          </span>
          <span class="min-w-0 flex-1 truncate"><Label label={entry.label} /></span>
        </button>
      </a>
    {:else}
      <button class="{menuItemClass} max-[480px]:min-h-11" data-account-row on:click={() => { activateEntry(entry) }}>
        <span class="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          <svelte:component this={entry.glyph} size={14} />
        </span>
        <span class="min-w-0 flex-1 truncate"><Label label={entry.label} params={entry.labelParams} /></span>
      </button>
    {/if}
  {/each}
</div>

<style>
  :global(#ui-root.mobile-theme .popup:not(.fullsize):has(> .servone-account-sheet)) {
    top: auto !important;
    right: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    max-width: none !important;
    max-height: 85dvh !important;
    border-bottom-width: 0;
    border-radius: 0.75rem 0.75rem 0 0;
  }
  :global(#ui-root.mobile-theme .popup > .servone-account-sheet) {
    min-height: 0;
    overflow-y: auto;
    padding-bottom: calc(0.25rem + env(safe-area-inset-bottom));
    border: none;
    border-radius: inherit;
  }
</style>
