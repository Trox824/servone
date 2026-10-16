<script lang="ts">
  import card, { type Card } from '@hcengineering/card'
  import chat from '@hcengineering/chat'
  import communication, { type GuestCommunicationSettings } from '@hcengineering/communication'
  import contact, { ensureEmployeeForPerson } from '@hcengineering/contact'
  import { getAccountClient } from '@hcengineering/contact-resources'
  import core, {
    type Account,
    AccountRole,
    type AccountUuid,
    type ModulePermissionGroup,
    getCurrentAccount,
    pickPrimarySocialId,
    readOnlyGuestAccountUuid,
    type Permission,
    type Ref
  } from '@hcengineering/core'
  import { getEmbeddedLabel, getMetadata, type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient, uiContext } from '@hcengineering/presentation'
  import setting from '@hcengineering/setting'
  import { Breadcrumb, Component, Header, Icon, Label, Loading, Scroller } from '@hcengineering/ui'
  import workbench, { type Application } from '@hcengineering/workbench'
  import { UserX } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { Button } from '../../../lib/components/ui/button'
  import * as Empty from '../../../lib/components/ui/empty'
  import { Switch } from '../../../lib/components/ui/switch'
  import settingsRes from '../plugin'
  import AnonymousGuestSpaceInput from './AnonymousGuestSpaceInput.svelte'
  import AvailableSpacesInput from './AvailableSpacesInput.svelte'
  import { intl } from '../../../lib/intl'

  const SERVONE_APP_ALIASES = ['chat', 'chunter', 'calendar', 'time', 'tracker', 'document', 'drive', 'love', 'contact']
  const LAST_IN_ORDER = Number.MAX_SAFE_INTEGER
  const GUESTS_OFF = 'setting:string:ServoneGuestsOff' as IntlString
  const GUESTS_OFF_HINT = 'setting:string:ServoneGuestsOffHint' as IntlString
  const guestTypeLabel = intl('setting:string:ServoneGuestType' as IntlString)
  const anonymousAccessLabel = intl('setting:string:ServoneAllowAnonymousAccess' as IntlString)
  const guestSignUpLabel = intl('setting:string:ServoneAllowGuestSignUp' as IntlString)
  const allowAccessLabel = intl('setting:string:ServoneAllowAccess' as IntlString)
  const allowLabel = intl('setting:string:ServoneAllow' as IntlString)

  const client = getClient()
  const excludedAppIds: string[] = getMetadata(workbench.metadata.ExcludedApplications) ?? []
  const isCommunicationEnabled = getMetadata(communication.metadata.Enabled) === true

  let permissionGroups: ModulePermissionGroup[] = []
  let permissionById = new Map<Ref<Permission>, Permission>()
  let hiddenAppIds = new Set<string>()
  let guestChatSettings: GuestCommunicationSettings | undefined

  let areGroupsDelivered = false
  let arePermissionsDelivered = false
  let areHiddenAppsDelivered = false
  let isWorkspaceInfoFinished = false

  let isAnonymousAccessOn = false
  let isGuestSignUpOn = false
  let isAnonymousSide = false

  createQuery().query(core.class.ModulePermissionGroup, {}, (foundGroups) => {
    permissionGroups = foundGroups
    areGroupsDelivered = true
  })

  createQuery().query(core.class.Permission, {}, (foundPermissions) => {
    permissionById = new Map(foundPermissions.map((permission) => [permission._id, permission]))
    arePermissionsDelivered = true
  })

  createQuery().query(
    workbench.class.HiddenApplication,
    { space: core.space.Workspace },
    (foundHiddenApps) => {
      hiddenAppIds = new Set(foundHiddenApps.map((hiddenApp) => hiddenApp.attachedTo))
      areHiddenAppsDelivered = true
    }
  )

  if (isCommunicationEnabled) {
    createQuery().query(communication.class.GuestCommunicationSettings, {}, (foundSettings) => {
      guestChatSettings = foundSettings[0]
    })
  }

  onMount(async () => {
    try {
      const workspaceInfo = await getAccountClient().getWorkspaceInfo()
      isAnonymousAccessOn = workspaceInfo.allowReadOnlyGuest ?? false
      isGuestSignUpOn = workspaceInfo.allowGuestSignUp ?? false
    } finally {
      isWorkspaceInfoFinished = true
    }
  })

  $: offeredApps = client
    .getModel()
    .findAllSync(workbench.class.Application, { hidden: false })
    .filter(
      (app) =>
        !excludedAppIds.includes(app._id) && !hiddenAppIds.has(app._id) && SERVONE_APP_ALIASES.includes(app.alias)
    )
  $: appById = new Map<string, Application>(offeredApps.map((app) => [app._id, app]))

  $: activeRole = isAnonymousSide ? AccountRole.ReadOnlyGuest : AccountRole.Guest
  $: isViewOnly = isAnonymousSide && !isAnonymousAccessOn
  $: isLoading = !(areGroupsDelivered && arePermissionsDelivered && areHiddenAppsDelivered && isWorkspaceInfoFinished)

  $: shownGroups = permissionGroups
    .filter((group) => appById.has(group.application) && group.role === activeRole)
    .sort((first, second) => (first.order ?? LAST_IN_ORDER) - (second.order ?? LAST_IN_ORDER))

  $: guestChannelsEditorProps = {
    _class: chat.masterTag.Thread,
    value: guestChatSettings?.allowedCards ?? [],
    label: settingsRes.string.GuestChannelsArrayLabel,
    onChange: saveAllowedCards
  }

  function permissionLabel (permissionId: Ref<Permission>, lookup: Map<Ref<Permission>, Permission>): IntlString {
    return lookup.get(permissionId)?.label ?? getEmbeddedLabel(permissionId)
  }

  async function changeAnonymousAccess (next: boolean): Promise<void> {
    const guestInfo = await getAccountClient().updateAllowReadOnlyGuests(next)
    isAnonymousAccessOn = next

    if (guestInfo !== undefined) {
      const { guestPerson, guestSocialIds } = guestInfo
      const guestAccount: Account = {
        uuid: guestPerson.uuid as AccountUuid,
        role: AccountRole.ReadOnlyGuest,
        primarySocialId: pickPrimarySocialId(guestSocialIds)._id,
        socialIds: guestSocialIds.map((socialId) => socialId._id),
        fullSocialIds: guestSocialIds
      }
      const connectContext = uiContext.newChild('connect', {})
      await ensureEmployeeForPerson(
        connectContext,
        getCurrentAccount(),
        guestAccount,
        client,
        guestSocialIds,
        guestPerson
      )
      return
    }

    const guestEmployee = await client.findOne(contact.mixin.Employee, { personUuid: readOnlyGuestAccountUuid })
    if (guestEmployee !== undefined) {
      await client.update(guestEmployee, { active: false })
    }
  }

  async function changeGuestSignUp (next: boolean): Promise<void> {
    await getAccountClient().updateAllowGuestSignUp(next)
    isGuestSignUpOn = next
  }

  async function saveAllowedCards (allowedCards: Ref<Card>[]): Promise<void> {
    if (guestChatSettings === undefined) {
      await client.createDoc(communication.class.GuestCommunicationSettings, core.space.Workspace, {
        allowedCards,
        enabled: true
      })
      return
    }
    await client.updateDoc(
      communication.class.GuestCommunicationSettings,
      core.space.Workspace,
      guestChatSettings._id,
      { allowedCards, enabled: true }
    )
  }

  function changeWholeApp (group: ModulePermissionGroup, next: boolean): void {
    if (isViewOnly) return
    void client.updateDoc(core.class.ModulePermissionGroup, core.space.Model, group._id, { enabled: next })
  }

  function changePermission (group: ModulePermissionGroup, permissionId: Ref<Permission>, isAllowed: boolean): void {
    if (isViewOnly || group.enabled === false) return
    const blockedIds = new Set(group.disabledPermissions ?? [])
    if (isAllowed) {
      blockedIds.delete(permissionId)
    } else {
      blockedIds.add(permissionId)
    }
    void client.updateDoc(core.class.ModulePermissionGroup, core.space.Model, group._id, {
      disabledPermissions: Array.from(blockedIds)
    })
  }
</script>

<div class="hulyComponent">
  <Header adaptive="disabled">
    <Breadcrumb
      icon={setting.icon.GuestPermissions}
      label={setting.string.GuestPermissionsSettings}
      size="large"
      isCurrent
    />
  </Header>

  {#if isLoading}
    <div class="flex-col-center justify-center w-full h-full">
      <Loading />
    </div>
  {:else}
    <Scroller>
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
        <div class="flex gap-2" role="group" aria-label={$guestTypeLabel}>
          <Button
            size="sm"
            variant={isAnonymousSide ? 'ghost' : 'secondary'}
            aria-pressed={!isAnonymousSide}
            onclick={() => (isAnonymousSide = false)}
          >
            <Label label={setting.string.GuestPermissionsTabGuest} />
          </Button>
          <Button
            size="sm"
            variant={isAnonymousSide ? 'secondary' : 'ghost'}
            aria-pressed={isAnonymousSide}
            onclick={() => (isAnonymousSide = true)}
          >
            <Label label={setting.string.GuestPermissionsTabAnonymousGuest} />
          </Button>
        </div>

        {#if isAnonymousSide}
          <div>
            <div class="mb-2 text-sm font-medium text-foreground">
              <Label label={settingsRes.string.GuestAccess} />
            </div>
            <div class="flex items-center justify-between gap-4 border-t border-border py-3">
              <span class="text-sm text-foreground"><Label label={settingsRes.string.GuestAccessDescription} /></span>
              <Switch
                aria-label={$anonymousAccessLabel}
                checked={isAnonymousAccessOn}
                onCheckedChange={(next) => void changeAnonymousAccess(next)}
              />
            </div>
            <div class="flex items-center justify-between gap-4 border-t border-border py-3">
              <span class="text-sm text-foreground"><Label label={settingsRes.string.GuestSignUpDescription} /></span>
              <Switch
                aria-label={$guestSignUpLabel}
                checked={isGuestSignUpOn}
                disabled={!isAnonymousAccessOn}
                onCheckedChange={(next) => void changeGuestSignUp(next)}
              />
            </div>
            {#if isCommunicationEnabled}
              <div class="flex items-center justify-between gap-4 border-t border-border py-3">
                <span class="text-sm text-foreground">
                  <Label label={settingsRes.string.GuestChannelsDescription} />
                </span>
                <Component is={card.component.CardArrayEditor} props={guestChannelsEditorProps} />
              </div>
            {/if}
          </div>
        {/if}

        <div class="flex flex-col gap-1">
          <div class="text-sm font-medium text-foreground">
            <Label label={setting.string.GuestPermissionsApplicationPermissions} />
          </div>
          <p class="m-0 text-sm text-muted-foreground">
            <Label
              label={isAnonymousSide
                ? setting.string.GuestPermissionsAnonymousApplicationHint
                : setting.string.GuestPermissionsApplicationPermissionsHint}
            />
          </p>
          <p class="m-0 text-sm text-muted-foreground">
            {#if isAnonymousSide}
              <Label label={settingsRes.string.GuestAnonymousVisibleSpacesHint} />
            {:else}
              <Label label={core.string.AutoJoinGuestsDescr} /> <Label label={settingsRes.string.GuestAutoJoinAvailableSpacesHint} />
            {/if}
          </p>
        </div>

        {#if shownGroups.length === 0}
          <Empty.Root class="border-0 py-12">
            <Empty.Header>
              <Empty.Media variant="icon"><UserX /></Empty.Media>
              <Empty.Title><Label label={GUESTS_OFF} /></Empty.Title>
              <p class="m-0 text-sm text-muted-foreground">
                <Label label={GUESTS_OFF_HINT} />
              </p>
            </Empty.Header>
          </Empty.Root>
        {:else}
          <div class="flex flex-col gap-6" class:opacity-70={isViewOnly}>
            {#each shownGroups as group (group._id)}
              {@const groupApp = appById.get(group.application)}
              {@const isAppOff = group.enabled === false}
              <div>
                <div class="flex items-center justify-between pb-2">
                  <div class="flex items-center text-sm font-medium text-foreground">
                    {#if groupApp !== undefined}
                      <span class="mr-2 flex"><Icon icon={groupApp.icon} size={'small'} /></span>
                    {/if}
                    <Label label={groupApp?.label ?? getEmbeddedLabel(group.application)} />
                  </div>
                  <Switch
                    aria-label={$allowAccessLabel}
                    checked={!isAppOff}
                    disabled={isViewOnly}
                    onCheckedChange={(next) => changeWholeApp(group, next)}
                  />
                </div>
                <div class:opacity-50={isAppOff}>
                  {#each group.permissions ?? [] as permissionId (permissionId)}
                    <div class="flex items-center justify-between gap-4 border-t border-border py-2.5">
                      <span class="text-sm text-foreground">
                        <Label label={permissionLabel(permissionId, permissionById)} />
                      </span>
                      <Switch
                        aria-label={$allowLabel}
                        checked={!(group.disabledPermissions ?? []).includes(permissionId)}
                        disabled={isAppOff || isViewOnly}
                        onCheckedChange={(next) => changePermission(group, permissionId, next)}
                      />
                    </div>
                  {/each}
                  {#if group.spaceClass !== undefined}
                    {#if !isAnonymousSide && group.role === AccountRole.Guest}
                      <div class="flex items-start justify-between gap-4 border-t border-border py-2.5">
                        <span class="text-sm text-foreground">
                          <Label label={settingsRes.string.GuestAutoJoinAvailableSpaces} />
                        </span>
                        <AvailableSpacesInput {group} disabled={isAppOff || isViewOnly} />
                      </div>
                    {:else if isAnonymousSide && group.role === AccountRole.ReadOnlyGuest}
                      <div class="flex items-start justify-between gap-4 border-t border-border py-2.5">
                        <span class="text-sm text-foreground">
                          <Label label={settingsRes.string.GuestAnonymousVisibleSpaces} />
                        </span>
                        <AnonymousGuestSpaceInput {group} disabled={isAppOff || isViewOnly} />
                      </div>
                    {/if}
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </Scroller>
  {/if}
</div>
