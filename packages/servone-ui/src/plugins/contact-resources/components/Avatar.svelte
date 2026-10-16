<script lang="ts">
  import {
    type AvatarInfo,
    type AvatarProvider,
    getAvatarColorForId,
    getAvatarDisplayName,
    getAvatarProvider,
    getAvatarProviderId,
    type Person
  } from '@hcengineering/contact'
  import type { AccountUuid, Data, PersonUuid, Ref, WithLookup } from '@hcengineering/core'
  import { type Asset, getResource } from '@hcengineering/platform'
  import { getBlobURL, getClient, reduceCalls, sizeToWidth } from '@hcengineering/presentation'
  import {
    type AnySvelteComponent,
    type ColorDefinition,
    getPlatformAvatarColorByName,
    getPlatformAvatarColorForTextDef,
    getPlatformColor,
    type IconSize,
    themeStore,
    tooltip
  } from '@hcengineering/ui'
  import { Moon } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { formatPauseTime, minuteClock, pauseString, readPause } from '../../../lib/notify/pause'
  import { loadUsersStatus, statusByUserStore } from '../utils'
  import { loadWorkspaceMemberStatuses, workspaceMemberStatusByAccountStore } from '../workspaceMemberStatus'
  import AvatarInstance from './AvatarInstance.svelte'
  import { getPreviewPopup } from './person/utils'

  export let person:
    | (Data<WithLookup<AvatarInfo>> & { _id?: Ref<Person>, personUuid?: PersonUuid })
    | Person
    | undefined = undefined
  export let name: string | null | undefined = undefined
  export let direct: Blob | undefined = undefined
  export let size: IconSize
  export let statusSize: IconSize | undefined = undefined
  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let variant: 'circle' | 'roundedRect' | 'none' = 'roundedRect'
  export let borderColor: number | undefined = undefined
  export let showStatus: boolean = false
  export let adaptiveName: boolean = false
  export let showPreview: boolean = false
  export let disabled: boolean = false
  export let style: 'modern' | undefined = undefined
  export let clickable: boolean = false
  export let clipPath: string | undefined = undefined

  export function pulse (): void {
    avatarInstance?.pulse()
  }

  let avatarInstance: AvatarInstance
  let avatarElement: HTMLElement
  let imageUrl: string | undefined
  let imageSrcset: string | undefined
  let avatarColor: ColorDefinition | undefined

  $: initials = getAvatarDisplayName(name)
  $: borderColorText = typeof borderColor === 'number' ? getPlatformColor(borderColor, $themeStore.dark) : undefined

  const resolveAppearance = reduceCalls(async function (
    requestedSize: IconSize,
    requestedPerson: typeof person,
    requestedDirect: Blob | undefined,
    requestedName: string | null | undefined
  ): Promise<void> {
    const shortName = getAvatarDisplayName(requestedName)
    const pixelWidth = sizeToWidth(requestedSize)

    if (requestedDirect !== undefined) {
      imageUrl = await getBlobURL(requestedDirect)
      imageSrcset = undefined
      return
    }
    if (requestedPerson !== undefined && requestedPerson !== null) {
      const providerId = getAvatarProviderId(requestedPerson.avatarType)
      const provider: AvatarProvider | undefined =
        providerId !== undefined ? await getAvatarProvider(getClient(), providerId) : undefined
      if (provider === undefined) {
        imageUrl = undefined
        avatarColor = getPlatformAvatarColorByName(
          requestedPerson.avatarProps?.color ?? getAvatarColorForId(shortName),
          $themeStore.dark
        )
        return
      }
      const loadAvatarUrl = await getResource(provider.getUrl)
      const resolved = await loadAvatarUrl(requestedPerson, shortName, pixelWidth)
      imageUrl = resolved.url
      imageSrcset = resolved.srcSet
      avatarColor = resolved.color
      return
    }
    imageUrl = undefined
    imageSrcset = undefined
    if (requestedName !== undefined && requestedName !== null) {
      avatarColor = getPlatformAvatarColorForTextDef(requestedName, $themeStore.dark)
    }
  })

  $: void resolveAppearance(size, person, direct, name)

  onMount(() => {
    loadUsersStatus()
    if (showStatus) loadWorkspaceMemberStatuses()
  })

  $: accountUuid = person?.personUuid as AccountUuid | undefined
  $: isOnline = accountUuid !== undefined && $statusByUserStore.get(accountUuid)?.online === true
  $: pauseEnd =
    showStatus && accountUuid !== undefined
      ? readPause($workspaceMemberStatusByAccountStore.get(accountUuid))?.until
      : undefined
  $: isPaused = pauseEnd !== undefined && $minuteClock < pauseEnd
  $: pauseTimeText =
    isPaused && pauseEnd !== undefined ? formatPauseTime(pauseEnd, $minuteClock, $themeStore.language) : ''
  $: markerSize = statusSize ?? size
  $: markerBaseClasses = `hulyAvatar-statusMarker ${markerSize} ${style ?? ''}`
  $: pausedMarkerColor = isOnline ? 'text-[var(--global-online-color)]' : 'text-muted-foreground'
</script>

<div
  class="flex-presenter"
  class:no-pointer={!clickable}
  use:tooltip={getPreviewPopup(person, showPreview)}
  on:click
>
  {#if showStatus && person}
    <div class="relative">
      <AvatarInstance
        bind:this={avatarInstance}
        bind:element={avatarElement}
        url={imageUrl}
        srcset={imageSrcset}
        displayName={initials}
        {size}
        {icon}
        {variant}
        color={avatarColor}
        bColor={borderColorText}
        {adaptiveName}
        {disabled}
        {style}
        {clipPath}
        withStatus={true}
      />
      {#if isPaused}
        <div
          class="{markerBaseClasses} flex items-center justify-center bg-background {pausedMarkerColor}"
          use:tooltip={{ label: pauseString.NotificationsPausedUntil, props: { time: pauseTimeText } }}
        >
          <Moon class="size-full" fill="currentColor" strokeWidth={0} />
        </div>
      {:else}
        <div class="{markerBaseClasses} {isOnline ? 'online' : 'offline'}"></div>
      {/if}
    </div>
  {:else}
    <AvatarInstance
      bind:this={avatarInstance}
      bind:element={avatarElement}
      url={imageUrl}
      srcset={imageSrcset}
      displayName={initials}
      {size}
      {icon}
      {variant}
      color={avatarColor}
      bColor={borderColorText}
      {adaptiveName}
      {disabled}
      {style}
      {clipPath}
    />
  {/if}
</div>
