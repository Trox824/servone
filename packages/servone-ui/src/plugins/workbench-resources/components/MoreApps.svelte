<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import presentation from '@hcengineering/presentation'
  import { Icon, Label, closePopup } from '@hcengineering/ui'
  import { NavLink } from '@hcengineering/view-resources'
  import type { Application } from '@hcengineering/workbench'
  import { Pin } from '@lucide/svelte'
  import { MAX_PHONE_BAR_APPS, phoneBarAliases, railString, togglePhoneBarApp } from '../rail'
  import { translate, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { get } from 'svelte/store'

  export let apps: Application[]
  export let active: Ref<Application> | undefined

  const appsTitle = 'workbench:string:ServoneAppsTitle' as IntlString
  const inBottomBar = 'workbench:string:ServoneInBottomBar' as IntlString
  const otherApps = 'workbench:string:ServoneOtherApps' as IntlString

  $: isBarFull = $phoneBarAliases.length >= MAX_PHONE_BAR_APPS
  const barAliasesAtOpen = get(phoneBarAliases)
  $: groups = [
    { title: inBottomBar, apps: barAliasesAtOpen.flatMap((alias) => apps.filter((app) => app.alias === alias)) },
    { title: otherApps, apps: apps.filter((app) => !barAliasesAtOpen.includes(app.alias)) }
  ].filter((group) => group.apps.length > 0)

  let pinLabel = ''
  let unpinLabel = ''
  $: void translate(railString.PinToBar, {}, $themeStore.language).then((text) => { pinLabel = text })
  $: void translate(railString.UnpinFromBar, {}, $themeStore.language).then((text) => { unpinLabel = text })
</script>

<div class="servone-more-sheet antiPopup min-w-60">
  <div class="mx-auto mt-2 hidden h-1 w-9 rounded-full bg-foreground/20 max-[480px]:block"></div>
  <div class="flex items-center justify-between pl-4 pr-2 pt-2">
    <h2 class="text-sm font-semibold text-foreground"><Label label={appsTitle} /></h2>
    <button
      type="button"
      class="inline-flex min-h-11 items-center px-2 text-sm text-primary"
      on:click={() => { closePopup() }}
    >
      <Label label={presentation.string.Close} />
    </button>
  </div>
  <div class="ap-scroll">
    <div class="ap-box">
      {#each groups as group (group.title)}
        <div class="px-3 pb-1 pt-2 text-xs text-muted-foreground"><Label label={group.title} /></div>
        {#each group.apps as app (app._id)}
          {@const isPinned = $phoneBarAliases.includes(app.alias)}
          <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center pl-2">
            <NavLink app={app.alias} disabled={app._id === active}>
              <button
                class="ap-menuItem withIcon noMargin flex-row-center w-full min-h-11"
                data-id={`app-more-row-${app.alias}`}
                on:click={() => closePopup()}
              >
                <div class="icon mr-2"><Icon icon={app.icon} size={'small'} /></div>
                <span class="label overflow-label flex-grow"><Label label={app.label} /></span>
              </button>
            </NavLink>
            <button
              class="inline-flex size-11 items-center justify-center rounded-md disabled:opacity-40 {isPinned
                ? 'text-primary'
                : 'text-muted-foreground'}"
              data-id={`app-pin-${app.alias}`}
              aria-label={isPinned ? unpinLabel : pinLabel}
              aria-pressed={isPinned}
              disabled={!isPinned && isBarFull}
              on:click={() => { togglePhoneBarApp(app.alias) }}
            >
              <Pin class="size-4" fill={isPinned ? 'currentColor' : 'none'} />
            </button>
          </div>
        {/each}
      {/each}
    </div>
  </div>
  <div class="ap-space x2"></div>
</div>

<style>
  :global(#ui-root.mobile-theme .popup:not(.fullsize):has(> .servone-more-sheet)) {
    top: auto !important;
    right: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    max-width: none !important;
    max-height: 85dvh !important;
    border-bottom-width: 0;
    border-radius: 0.75rem 0.75rem 0 0;
  }
  :global(#ui-root.mobile-theme .popup > .servone-more-sheet) {
    width: 100%;
    max-width: none;
    padding-bottom: env(safe-area-inset-bottom);
    border: none;
    border-radius: inherit;
  }
</style>
