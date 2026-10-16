<script lang="ts">
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { getResource, translate, type IntlString } from '@hcengineering/platform'
  import presentation, { copyTextToClipboard, createQuery } from '@hcengineering/presentation'
  import setting, { RoleCapability } from '@hcengineering/setting'
  import { getDefaultInviteRole, resolveInviteSettings } from '@hcengineering/setting-resources'
  import { Label, themeStore, ticker } from '@hcengineering/ui'
  import { Check, Copy, Loader2, X } from '@lucide/svelte'
  import { createEventDispatcher } from 'svelte'
  import { Button } from '../../../lib/components/ui/button'
  import { Input } from '../../../lib/components/ui/input'
  import * as Select from '../../../lib/components/ui/select'
  import { Switch } from '../../../lib/components/ui/switch'
  import login from '../plugin'
  import { getInviteLink } from '../utils'
  import { intl } from '../../../lib/intl'

  export let role: AccountRole | undefined = undefined
  export let ignoreSettings: boolean = false

  const dispatch = createEventDispatcher()

  const COPIED_FLASH_MS = 1000
  const ROLE_OPTIONS = [
    { role: AccountRole.Guest, label: 'setting:string:ServoneRoleGuest' as IntlString },
    { role: AccountRole.User, label: 'setting:string:ServoneRoleMember' as IntlString },
    { role: AccountRole.Maintainer, label: 'setting:string:ServoneRoleMaintainer' as IntlString },
    { role: AccountRole.Owner, label: 'setting:string:ServoneRoleOwner' as IntlString }
  ]
  const ROLE = 'setting:string:Role' as IntlString
  const closeText = intl(presentation.string.Close)
  const inviteRoleText = intl('login:string:ServoneInviteRole' as IntlString)

  const currentAccount = getCurrentAccount()
  const roleOptions = ROLE_OPTIONS.filter((option) => hasAccountRole(currentAccount, option.role))
  const fallbackRole = getDefaultInviteRole()
  const isSecureBrowser = window.isSecureContext
  const settingsQuery = createQuery()

  let validityHours = 48
  let emailMask = ''
  let joinCap: number | undefined
  let isNoLimit = false
  let isUsingWorkspaceSettings = true
  let inviteUrl = ''
  let isLoading = false
  let canGenerate = false
  let workspaceHours = 48
  let workspaceMask = ''
  let workspaceCap: number | undefined
  let isWorkspaceNoLimit = false
  let workspaceRole: AccountRole | undefined
  let copiedAt: number | undefined
  let roleNames = new Map<AccountRole, string>()

  async function translateRoleNames (language: string): Promise<void> {
    const entries = await Promise.all(
      roleOptions.map(async (option) => [option.role, await translate(option.label, {}, language)] as const)
    )
    roleNames = new Map(entries)
  }

  $: void translateRoleNames($themeStore.language)

  void getResource(setting.function.HasRoleCapability).then(async (hasCapability) => {
    canGenerate = await hasCapability(RoleCapability.GenerateInviteLink)
  })

  function applyWorkspaceSettings (settingsDoc: Parameters<typeof resolveInviteSettings>[0]): void {
    const resolvedSettings = resolveInviteSettings(settingsDoc)
    validityHours = resolvedSettings.expirationTime
    emailMask = resolvedSettings.emailMask
    joinCap = resolvedSettings.noLimit ? undefined : resolvedSettings.limit
    isNoLimit = resolvedSettings.noLimit
    workspaceHours = resolvedSettings.expirationTime
    workspaceMask = resolvedSettings.emailMask
    workspaceCap = joinCap
    isWorkspaceNoLimit = resolvedSettings.noLimit
    if (role === null || role === undefined) role = resolvedSettings.defaultInviteRole
    workspaceRole = role
  }

  function discardLink (): void {
    inviteUrl = ''
  }

  function toggleWorkspaceSettings (isOn: boolean): void {
    isUsingWorkspaceSettings = isOn
    validityHours = workspaceHours
    emailMask = workspaceMask
    joinCap = workspaceCap
    isNoLimit = isWorkspaceNoLimit
    role = workspaceRole
    discardLink()
  }

  function toggleNoLimit (isOn: boolean): void {
    isNoLimit = isOn
    discardLink()
  }

  function pickRole (roleValue: string): void {
    role = roleOptions.find((option) => option.role === roleValue)?.role
    discardLink()
  }

  async function generateLink (): Promise<void> {
    if (!canGenerate) return
    if (!((joinCap ?? 0) > 0 || isNoLimit)) return
    isLoading = true
    try {
      inviteUrl = await getInviteLink(validityHours, emailMask, isNoLimit ? -1 : joinCap ?? -1, role ?? fallbackRole)
    } finally {
      isLoading = false
    }
  }

  async function copyLink (): Promise<void> {
    if (!isSecureBrowser || inviteUrl === '') return
    await copyTextToClipboard(inviteUrl)
    copiedAt = Date.now()
  }

  $: if (!ignoreSettings) {
    settingsQuery.query(setting.class.InviteSettings, {}, (settingsDocs) => {
      applyWorkspaceSettings(settingsDocs[0])
    })
  } else {
    settingsQuery.unsubscribe()
  }

  $: canOverrideSettings = hasAccountRole(currentAccount, AccountRole.Maintainer) && !ignoreSettings
  $: selectedRole = role ?? fallbackRole
  $: selectedRoleName = roleNames.get(selectedRole) ?? ''
  $: isCopied = copiedAt !== undefined && $ticker - copiedAt <= COPIED_FLASH_MS
</script>

<div
  class="flex w-[28rem] max-w-[calc(100vw-2rem)] flex-col gap-5 rounded-lg border bg-popover p-6 text-sm text-popover-foreground shadow-lg"
>
  <div class="flex items-start justify-between gap-4">
    <h2 id="invite-link-title" class="m-0 text-base font-semibold">
      <Label label={login.string.InviteDescription} />
    </h2>
    <button
      type="button"
      aria-label={$closeText}
      class="-mr-1 -mt-1 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      on:click={() => dispatch('close')}
    >
      <X class="size-4" />
    </button>
  </div>

  {#if canOverrideSettings}
    <div class="grid gap-4">
      <div class="flex items-center justify-between gap-4">
        <label for="invite-use-default" class="text-sm"><Label label={login.string.UseWorkspaceInviteSettings} /></label>
        <Switch id="invite-use-default" checked={isUsingWorkspaceSettings} onCheckedChange={toggleWorkspaceSettings} />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="invite-hours" class="text-sm font-medium"><Label label={login.string.LinkValidHours} /></label>
        <Input
          id="invite-hours"
          type="number"
          min="1"
          class="tabular-nums"
          disabled={isUsingWorkspaceSettings}
          bind:value={validityHours}
          oninput={discardLink}
        />
      </div>

      <div class="flex items-center justify-between gap-4">
        <label for="invite-no-limit" class="text-sm"><Label label={login.string.NoLimit} /></label>
        <Switch id="invite-no-limit" checked={isNoLimit} disabled={isUsingWorkspaceSettings} onCheckedChange={toggleNoLimit} />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="invite-limit" class="text-sm font-medium"><Label label={login.string.InviteLimit} /></label>
        <Input
          id="invite-limit"
          type="number"
          min="1"
          class="tabular-nums"
          disabled={isUsingWorkspaceSettings || isNoLimit}
          bind:value={joinCap}
          oninput={discardLink}
        />
      </div>

      <div class="flex items-center justify-between gap-4">
        <span class="text-sm"><Label label={ROLE} /></span>
        <Select.Root type="single" value={selectedRole} disabled={isUsingWorkspaceSettings} onValueChange={pickRole}>
          <Select.Trigger class="w-40" aria-label={$inviteRoleText}>{selectedRoleName}</Select.Trigger>
          <Select.Content>
            {#each roleOptions as option (option.role)}
              <Select.Item value={option.role} label={roleNames.get(option.role) ?? ''} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>
  {/if}

  <div class="flex items-center justify-end gap-2">
    {#if inviteUrl === ''}
      <Button disabled={!canGenerate || isLoading} onclick={generateLink}>
        {#if isLoading}
          <Loader2 class="size-4 animate-spin" />
        {/if}
        <Label label={login.string.GetLink} />
      </Button>
    {:else}
      <Input
        readonly
        value={inviteUrl}
        aria-labelledby="invite-link-title"
        class="min-w-0 flex-1 font-mono text-xs"
        onfocus={(event) => event.currentTarget.select()}
      />
      {#if isSecureBrowser}
        <Button variant="outline" onclick={copyLink}>
          {#if isCopied}
            <Check class="size-4" />
            <Label label={login.string.Copied} />
          {:else}
            <Copy class="size-4" />
            <Label label={login.string.Copy} />
          {/if}
        </Button>
      {/if}
    {/if}
  </div>
</div>
