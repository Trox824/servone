<!-- Settings > Members: workspace members with an inline role select; role changes mirror server/account updateWorkspaceRole. -->
<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import contact, { type Employee, formatName } from '@hcengineering/contact'
  import { Avatar } from '@hcengineering/contact-resources'
  import {
    AccountRole,
    getCurrentAccount,
    hasAccountRole,
    readOnlyGuestAccountUuid,
    type Ref,
    type WorkspaceMemberInfo
  } from '@hcengineering/core'
  import login from '@hcengineering/login'
  import { translate, type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient, isDisabled } from '@hcengineering/presentation'
  import { Breadcrumb, Header, Label, Scroller, showPopup, themeStore } from '@hcengineering/ui'
  import { Search, UserPlus, Users } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { Badge } from '../../../lib/components/ui/badge'
  import { Button } from '../../../lib/components/ui/button'
  import * as Empty from '../../../lib/components/ui/empty'
  import { Input } from '../../../lib/components/ui/input'
  import * as Select from '../../../lib/components/ui/select'
  import setting from '../plugin'
  import { getAccountClient } from '../utils'
  import { intl } from '../../../lib/intl'

  const ROLE_LABELS = [
    [AccountRole.ReadOnlyGuest, 'setting:string:ServoneRoleReadOnlyGuest' as IntlString],
    [AccountRole.DocGuest, 'setting:string:ServoneRoleDocGuest' as IntlString],
    [AccountRole.Guest, 'setting:string:ServoneRoleGuest' as IntlString],
    [AccountRole.User, 'setting:string:ServoneRoleMember' as IntlString],
    [AccountRole.Maintainer, 'setting:string:ServoneRoleMaintainer' as IntlString],
    [AccountRole.Owner, 'setting:string:ServoneRoleOwner' as IntlString]
  ] as const
  const INVITE = 'setting:string:ServoneInviteTeammate' as IntlString
  const NO_MEMBERS = 'setting:string:ServoneNoMembers' as IntlString
  const NO_MEMBERS_MATCH = 'setting:string:ServoneNoMembersMatch' as IntlString
  const DEACTIVATED = 'setting:string:ServoneDeactivated' as IntlString
  const searchPlaceholder = intl('setting:string:ServoneMemberSearch' as IntlString)
  const searchLabel = intl('setting:string:ServoneMemberSearchLabel' as IntlString)
  const membersLabel = intl(setting.string.Members)
  const roleOfLabel = intl('setting:string:ServoneRoleOf' as IntlString)
  const deactivateLabel = intl('setting:string:ServoneDeactivate' as IntlString)
  const reactivateLabel = intl('setting:string:ServoneReactivate' as IntlString)
  const ASSIGNABLE_ROLES = [AccountRole.User, AccountRole.Maintainer, AccountRole.Owner]
  const GUEST_ROLES = [AccountRole.ReadOnlyGuest, AccountRole.DocGuest, AccountRole.Guest]

  const client = getClient()
  const accountClient = getAccountClient()
  const currentAccount = getCurrentAccount()
  const employeeQuery = createQuery()
  const emailQuery = createQuery()

  let workspaceMembers: Record<string, WorkspaceMemberInfo> = {}
  let employees: Employee[] = []
  let emailByPerson = new Map<string, string>()
  let search = ''
  let actionError: string | undefined
  let roleNames = new Map<AccountRole, string>()

  async function translateRoleNames (language: string): Promise<void> {
    const entries = await Promise.all(
      ROLE_LABELS.map(async ([role, label]) => [role, await translate(label, {}, language)] as const)
    )
    roleNames = new Map(entries)
  }

  $: void translateRoleNames($themeStore.language)

  const canManageMembers = hasAccountRole(currentAccount, AccountRole.Maintainer)
  const canInvite = hasAccountRole(currentAccount, AccountRole.User) && !isDisabled('invites')

  async function loadMembers (): Promise<void> {
    const found = await accountClient.getWorkspaceMembers()
    workspaceMembers = Object.fromEntries(found.map((member) => [member.person, member]))
  }

  onMount(loadMembers)

  employeeQuery.query(contact.mixin.Employee, {}, (found) => {
    employees = found
      .filter((employee) => employee.personUuid != null)
      .sort((a, b) => formatName(a.name).localeCompare(formatName(b.name)))
  })

  emailQuery.query(contact.class.Channel, { provider: contact.channelProvider.Email }, (channels) => {
    emailByPerson = new Map(channels.map((channel) => [channel.attachedTo as Ref<Employee>, channel.value]))
  })

  $: ownersCount = employees.filter((employee) => {
    const member = workspaceMembers[employee.personUuid ?? '']
    return member?.role === AccountRole.Owner && !member.disabled
  }).length

  $: members = employees.filter((employee) => {
    const member = workspaceMembers[employee.personUuid ?? '']
    if (member === undefined) return false
    const needle = search.trim().toLowerCase()
    if (needle === '') return true
    return (
      formatName(employee.name).toLowerCase().includes(needle) ||
      (emailByPerson.get(employee._id) ?? '').toLowerCase().includes(needle)
    )
  })

  function rolesFor (current: AccountRole): AccountRole[] {
    const assignable = ASSIGNABLE_ROLES.filter((role) => hasAccountRole(currentAccount, role))
    return assignable.includes(current) ? assignable : [current, ...assignable]
  }

  function isDeactivated (employee: Employee): boolean {
    return workspaceMembers[employee.personUuid ?? '']?.disabled === true
  }

  function canChangeRole (employee: Employee, role: AccountRole): boolean {
    return (
      canManageMembers &&
      hasAccountRole(currentAccount, role) &&
      currentAccount.uuid !== employee.personUuid &&
      !(role === AccountRole.Owner && ownersCount === 1) &&
      employee.personUuid !== readOnlyGuestAccountUuid &&
      !isDeactivated(employee)
    )
  }

  function canToggleDeactivation (employee: Employee, member: WorkspaceMemberInfo): boolean {
    return (
      canManageMembers &&
      hasAccountRole(currentAccount, member.role) &&
      currentAccount.uuid !== employee.personUuid &&
      (member.disabled || !(member.role === AccountRole.Owner && ownersCount === 1))
    )
  }

  async function changeRole (employee: Employee, role: AccountRole): Promise<void> {
    const personUuid = employee.personUuid
    const member = personUuid == null ? undefined : workspaceMembers[personUuid]
    if (personUuid == null || member === undefined || member.role === role) return
    try {
      await accountClient.updateWorkspaceRole(personUuid, role)
      workspaceMembers[personUuid] = { ...member, role }
      await client.update(employee, { role: GUEST_ROLES.includes(role) ? 'GUEST' : 'USER' })
    } catch (error) {
      Analytics.handleError(error as Error)
    }
  }

  async function setDeactivated (employee: Employee, disabled: boolean): Promise<void> {
    const personUuid = employee.personUuid
    const member = personUuid == null ? undefined : workspaceMembers[personUuid]
    if (personUuid == null || member === undefined) return
    actionError = undefined
    try {
      if (disabled) {
        await accountClient.deactivateWorkspaceMember(personUuid)
      } else {
        await accountClient.reactivateWorkspaceMember(personUuid)
      }
    } catch (error) {
      Analytics.handleError(error as Error)
      actionError = await translate(
        disabled
          ? ('setting:string:ServoneDeactivateFailed' as IntlString)
          : ('setting:string:ServoneReactivateFailed' as IntlString),
        { name: formatName(employee.name), error: (error as Error).message }
      )
    }
    await loadMembers()
    const stored = workspaceMembers[personUuid]
    if (stored !== undefined) {
      await client.update(employee, { active: !stored.disabled })
    }
  }

  function invite (): void {
    showPopup(login.component.InviteLink, {})
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={setting.icon.Members} label={setting.string.Members} size={'large'} isCurrent />
    <svelte:fragment slot="actions">
      {#if canInvite}
        <Button size="sm" onclick={invite}><UserPlus /><Label label={INVITE} /></Button>
      {/if}
    </svelte:fragment>
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-6">
      <div class="relative">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input class="pl-8" bind:value={search} placeholder={$searchPlaceholder} aria-label={$searchLabel} />
      </div>

      {#if members.length === 0}
        <Empty.Root class="border-0 py-16">
          <Empty.Header>
            <Empty.Media variant="icon"><Users /></Empty.Media>
            <Empty.Title>
              {#if search.trim() === ''}
                <Label label={NO_MEMBERS} />
              {:else}
                <Label label={NO_MEMBERS_MATCH} params={{ query: search.trim() }} />
              {/if}
            </Empty.Title>
          </Empty.Header>
        </Empty.Root>
      {:else}
        <ul class="m-0 flex list-none flex-col p-0" aria-label={$membersLabel}>
          {#each members as employee (employee._id)}
            {@const member = workspaceMembers[employee.personUuid ?? '']}
            {@const role = member?.role ?? AccountRole.User}
            {@const deactivated = member?.disabled === true}
            {@const email = emailByPerson.get(employee._id)}
            <li
              class="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
              data-id="owners-member-row"
            >
              <Avatar person={employee} name={employee.name} size="small" variant="circle" />
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm font-medium text-foreground">{formatName(employee.name)}</span>
                {#if email !== undefined}
                  <span class="truncate text-xs text-muted-foreground">{email}</span>
                {/if}
              </div>
              {#if deactivated}
                <Badge variant="secondary"><Label label={DEACTIVATED} /></Badge>
              {/if}
              <Select.Root
                type="single"
                value={role}
                disabled={!canChangeRole(employee, role)}
                onValueChange={(picked) => {
                  void changeRole(employee, picked as AccountRole)
                }}
              >
                <Select.Trigger class="w-36" aria-label={`${$roleOfLabel} ${formatName(employee.name)}`}>
                  {roleNames.get(role) ?? ''}
                </Select.Trigger>
                <Select.Content>
                  {#each rolesFor(role) as option (option)}
                    <Select.Item value={option} label={roleNames.get(option) ?? ''} />
                  {/each}
                </Select.Content>
              </Select.Root>
              {#if member !== undefined && canToggleDeactivation(employee, member)}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`${deactivated ? $reactivateLabel : $deactivateLabel} ${formatName(employee.name)}`}
                  onclick={() => {
                    void setDeactivated(employee, !deactivated)
                  }}
                >
                  {deactivated ? $reactivateLabel : $deactivateLabel}
                </Button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if actionError !== undefined}
        <p class="m-0 text-sm text-destructive" role="alert">{actionError}</p>
      {/if}
    </div>
  </Scroller>
</div>
