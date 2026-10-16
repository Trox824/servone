<script lang="ts">
  import core, { AccountRole, getCurrentAccount } from '@hcengineering/core'
  import login from '@hcengineering/login'
  import { translate } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import setting, { RoleCapability, type InviteSettings, type RoleCapabilitySettings } from '@hcengineering/setting'
  import { Breadcrumb, Header, Label, Loading, Scroller, themeStore } from '@hcengineering/ui'
  import { Input } from '../../../lib/components/ui/input'
  import * as Select from '../../../lib/components/ui/select'
  import { Switch } from '../../../lib/components/ui/switch'
  import { getDefaultInviteRole, getDefaultInviterRoles, resolveInviteSettings } from '../inviteSettingsUtils'
  import settingRes from '../plugin'
  import { hasRoleCapability } from '../roleCapability'
  import { intl } from '../../../lib/intl'

  const client = getClient()
  const lifetimeLabel = intl(login.string.LinkValidHours)
  const noLimitLabel = intl(login.string.NoLimit)
  const limitLabel = intl(login.string.InviteLimit)

  const JOIN_ROLE_CHOICES = [AccountRole.Guest, AccountRole.User]
  const GENERATOR_ROLE_CHOICES = [AccountRole.User, AccountRole.Maintainer, AccountRole.Owner]
  const ROLE_LABELS = [
    [AccountRole.Guest, settingRes.string.Guest],
    [AccountRole.User, settingRes.string.User],
    [AccountRole.Maintainer, settingRes.string.Maintainer],
    [AccountRole.Owner, settingRes.string.Owner]
  ] as const

  let isLoading = true
  let linkLifetimeHours = 48
  let emailMask = ''
  let joinCap: number | undefined = -1
  let isNoLimit = true
  let joinRole = getDefaultInviteRole()
  let generatorRoles = getDefaultInviterRoles()
  let inviteSettingsDocs: InviteSettings[] = []
  let roleCapabilityDoc: RoleCapabilitySettings | undefined
  let roleNames = new Map<AccountRole, string>()

  const roleCapabilityQuery = createQuery()
  roleCapabilityQuery.query(setting.class.RoleCapabilitySettings, {}, (docs) => {
    roleCapabilityDoc = docs[0]
  })

  const inviteSettingsQuery = createQuery()
  inviteSettingsQuery.query(setting.class.InviteSettings, {}, (docs) => {
    inviteSettingsDocs = docs
    const resolved = resolveInviteSettings(docs[0])
    linkLifetimeHours = resolved.expirationTime
    emailMask = resolved.emailMask
    joinCap = resolved.limit
    joinRole = resolved.defaultInviteRole
    generatorRoles = resolved.inviteLinkGeneratorRoles
    isNoLimit = resolved.noLimit
    isLoading = false
  })

  async function translateRoleNames (language: string): Promise<void> {
    const entries = await Promise.all(
      ROLE_LABELS.map(async ([role, label]) => [role, await translate(label, {}, language)] as const)
    )
    roleNames = new Map(entries)
  }

  $: if (typeof $themeStore.language === 'string') void translateRoleNames($themeStore.language)

  $: canEditGeneratorRoles = hasRoleCapability(
    getCurrentAccount(),
    RoleCapability.ManageInviteSettings,
    roleCapabilityDoc?.roleByCapability,
    undefined
  )
  $: isCapInvalid = !isNoLimit && (joinCap === undefined || Number.isNaN(joinCap))
  $: generatorRolesText = generatorRoles.map((role) => roleNames.get(role) ?? '').join(', ')

  async function saveSettings (): Promise<void> {
    if (isLoading || isCapInvalid) return

    linkLifetimeHours = Math.max(1, linkLifetimeHours || 1)
    joinCap = isNoLimit ? -1 : Math.max(1, joinCap ?? 1)

    const invitePayload = {
      expirationTime: linkLifetimeHours,
      emailMask,
      limit: joinCap ?? -1,
      defaultInviteRole: joinRole,
      inviteLinkGeneratorRoles: [...generatorRoles],
      enabled: true
    }
    const existingInviteDoc = inviteSettingsDocs[0]
    if (existingInviteDoc === undefined) {
      await client.createDoc(setting.class.InviteSettings, core.space.Workspace, invitePayload)
    } else {
      await client.updateDoc(setting.class.InviteSettings, core.space.Workspace, existingInviteDoc._id, invitePayload)
    }

    const capabilityPayload = {
      roleByCapability: {
        ...(roleCapabilityDoc?.roleByCapability ?? {}),
        [RoleCapability.GenerateInviteLink]: [...generatorRoles]
      },
      enabled: true
    }
    if (roleCapabilityDoc === undefined) {
      await client.createDoc(setting.class.RoleCapabilitySettings, core.space.Workspace, capabilityPayload)
    } else {
      await client.updateDoc(
        setting.class.RoleCapabilitySettings,
        core.space.Workspace,
        roleCapabilityDoc._id,
        capabilityPayload
      )
    }
  }

  function commitLifetime (event: Event): void {
    if (!(event.currentTarget instanceof HTMLInputElement)) return
    linkLifetimeHours = Number(event.currentTarget.value)
    void saveSettings()
  }

  function commitCap (event: Event): void {
    if (!(event.currentTarget instanceof HTMLInputElement)) return
    joinCap = Number(event.currentTarget.value)
    void saveSettings()
  }

  function changeNoLimit (next: boolean): void {
    isNoLimit = next
    if (next) {
      joinCap = -1
    } else if (joinCap === undefined || Number.isNaN(joinCap) || joinCap < 1) {
      joinCap = 1
    }
    void saveSettings()
  }

  function pickJoinRole (picked: string): void {
    const chosenRole = JOIN_ROLE_CHOICES.find((role) => role === picked)
    if (chosenRole === undefined) return
    joinRole = chosenRole
    void saveSettings()
  }

  function pickGeneratorRoles (picked: string[]): void {
    generatorRoles = GENERATOR_ROLE_CHOICES.filter((role) => picked.includes(role))
    void saveSettings()
  }
</script>

<div class="hulyComponent">
  <Header adaptive="disabled">
    <Breadcrumb icon={setting.icon.InviteSettings} label={settingRes.string.InviteSettings} size="large" isCurrent />
  </Header>
  {#if isLoading}
    <div class="flex-col-center justify-center w-full h-full">
      <Loading />
    </div>
  {:else}
    <Scroller>
      <div class="mx-auto flex w-full max-w-2xl flex-col px-6 py-6">
        <div class="flex items-center justify-between gap-4 border-b border-border py-3">
          <span class="text-sm text-foreground"><Label label={login.string.LinkValidHours} /></span>
          <Input
            class="w-24"
            type="number"
            min={1}
            value={linkLifetimeHours}
            aria-label={$lifetimeLabel}
            onchange={commitLifetime}
          />
        </div>
        <div class="flex items-center justify-between gap-4 border-b border-border py-3">
          <span class="text-sm text-foreground"><Label label={login.string.NoLimit} /></span>
          <Switch aria-label={$noLimitLabel} checked={isNoLimit} onCheckedChange={changeNoLimit} />
        </div>
        {#if !isNoLimit}
          <div class="flex items-center justify-between gap-4 border-b border-border py-3">
            <span class="text-sm text-foreground"><Label label={login.string.InviteLimit} /></span>
            <Input
              class="w-24"
              type="number"
              min={1}
              value={joinCap}
              aria-label={$limitLabel}
              onchange={commitCap}
            />
          </div>
        {/if}
        <div class="flex items-center justify-between gap-4 border-b border-border py-3">
          <span class="text-sm text-foreground"><Label label={settingRes.string.DefaultInviteRoleForJoin} /></span>
          <Select.Root type="single" value={joinRole} onValueChange={pickJoinRole}>
            <Select.Trigger class="w-44">{roleNames.get(joinRole) ?? ''}</Select.Trigger>
            <Select.Content>
              {#each JOIN_ROLE_CHOICES as role (role)}
                <Select.Item value={role} label={roleNames.get(role) ?? ''} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        {#if canEditGeneratorRoles}
          <div class="flex items-center justify-between gap-4 border-b border-border py-3">
            <span class="text-sm text-foreground"><Label label={settingRes.string.InviteLinkGeneratorRoles} /></span>
            <Select.Root type="multiple" value={generatorRoles} onValueChange={pickGeneratorRoles}>
              <Select.Trigger class="w-60">{generatorRolesText}</Select.Trigger>
              <Select.Content>
                {#each GENERATOR_ROLE_CHOICES as role (role)}
                  <Select.Item value={role} label={roleNames.get(role) ?? ''} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        {/if}
      </div>
    </Scroller>
  {/if}
</div>
