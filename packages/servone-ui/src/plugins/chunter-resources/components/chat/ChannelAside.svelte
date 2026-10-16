<script lang="ts">
  import core, { getCurrentAccount, notEmpty, type Ref } from '@hcengineering/core'
  import presentation, { getClient } from '@hcengineering/presentation'
  import { Label, showPopup, tooltip } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { UserPlus, X } from '@lucide/svelte'
  import chunter, { type Channel, type ChunterSpace, type ObjectChatPanel } from '@hcengineering/chunter'
  import { getCurrentEmployee, type Employee, type Person } from '@hcengineering/contact'
  import {
    EmployeeBox,
    employeeByIdStore,
    employeeRefByAccountUuidStore,
    getPersonByPersonRefStore,
    getPersonRefByPersonIdCb,
    SelectUsersPopup,
    UserDetails
  } from '@hcengineering/contact-resources'
  import { Button } from '../../../../lib/components/ui/button'
  import DocAside from './DocAside.svelte'
  import EditChannelSettingsTab from '../EditChannelSettingsTab.svelte'
  import { joinChannel, leaveChannel } from '../../utils'
  import chunterResources from '../../plugin'
  import { canEditChannel } from '../../announce/policy'
  import { currentActor } from '../../announce/setup'

  export let object: ChunterSpace
  export let objectChatPanel: ObjectChatPanel | undefined

  const hierarchy = getClient().getHierarchy()
  const viewerActor = currentActor()
  const currentEmployee = getCurrentEmployee()
  const HIDDEN_AUTO_JOIN_KEYS = ['autoJoin', 'autoJoinForRoles']

  let creatorPersonRef: Ref<Person> | undefined

  $: channel = hierarchy.isDerived(object._class, chunter.class.Channel) ? (object as Channel) : undefined
  $: isLocked = channel !== undefined && !canEditChannel(channel, viewerActor)
  $: isMembershipReadonly = object.archived === true

  $: asidePanel =
    objectChatPanel === undefined
      ? undefined
      : { ...objectChatPanel, ignoreKeys: [...objectChatPanel.ignoreKeys, ...HIDDEN_AUTO_JOIN_KEYS] }

  function resolveCreator (creatorPersonId: NonNullable<ChunterSpace['createdBy']>): void {
    getPersonRefByPersonIdCb(creatorPersonId, (personRef) => {
      if (personRef !== null) creatorPersonRef = personRef
    })
  }

  $: creatorPersonId = object.createdBy
  $: if (creatorPersonId !== undefined) resolveCreator(creatorPersonId)

  $: memberRefs = object.members
    .map((accountUuid) => $employeeRefByAccountUuidStore.get(accountUuid))
    .filter(notEmpty)
  $: memberPersonsStore = getPersonByPersonRefStore(memberRefs)
  $: listedPersons = memberRefs.map((personRef) => $memberPersonsStore.get(personRef)).filter(notEmpty)

  $: isCreatorOtherUser =
    creatorPersonId !== undefined && !getCurrentAccount().socialIds.includes(creatorPersonId)
  $: unremovableRefs = isLocked
    ? memberRefs.filter((personRef) => personRef !== currentEmployee)
    : isCreatorOtherUser && creatorPersonRef !== undefined
      ? [creatorPersonRef]
      : []

  function toAccountUuids (personRefs: Array<Ref<Person>>): NonNullable<Employee['personUuid']>[] {
    return personRefs
      .map((personRef) => $employeeByIdStore.get(personRef as Ref<Employee>)?.personUuid)
      .filter(notEmpty)
  }

  async function removeMember (person: Person): Promise<void> {
    const accountUuids = toAccountUuids([person._id])
    if (accountUuids.length === 0) return
    await leaveChannel(object as Channel, accountUuids)
  }

  async function applyMembershipChange (selectedRefs: Array<Ref<Person>> | null | undefined): Promise<void> {
    if (selectedRefs == null) return
    const leaverAccounts = toAccountUuids(memberRefs.filter((personRef) => !selectedRefs.includes(personRef)))
    const joinerAccounts = toAccountUuids(selectedRefs.filter((personRef) => !memberRefs.includes(personRef)))
    await Promise.all([
      leaverAccounts.length > 0 ? leaveChannel(object as Channel, leaverAccounts) : undefined,
      joinerAccounts.length > 0 ? joinChannel(object as Channel, joinerAccounts) : undefined
    ])
  }

  function openAddMembersPopup (): void {
    showPopup(
      SelectUsersPopup,
      {
        okLabel: presentation.string.Add,
        disableDeselectFor: unremovableRefs,
        skipInactive: true,
        selected: memberRefs,
        showStatus: true
      },
      'top',
      applyMembershipChange
    )
  }
</script>

<DocAside {object} objectChatPanel={asidePanel} locked={isLocked}>
  {#if creatorPersonRef !== undefined}
    <div class="popupPanel-body__aside-grid" style="margin-top: 0">
      <span class="labelOnPanel" use:tooltip={{ component: Label, props: { label: core.string.CreatedBy } }}>
        <Label label={core.string.CreatedBy} />
      </span>
      <div class="flex grow min-w-0">
        <EmployeeBox
          value={creatorPersonRef}
          label={core.string.CreatedBy}
          kind="link"
          size="medium"
          avatarSize="card"
          width="100%"
          showNavigate={false}
          readonly
        />
      </div>
    </div>
  {/if}

  <section class="channel-aside__section">
    <div class="flex items-center justify-between gap-2">
      <h3 class="channel-aside__heading">
        <Label label={chunterResources.string.Members} />
        <span class="tabular-nums">{listedPersons.length}</span>
      </h3>
      {#if !isMembershipReadonly}
        <Button size="icon-sm" variant="ghost" onclick={openAddMembersPopup}>
          <UserPlus />
          <span class="sr-only"><Label label={chunter.string.AddMembers} /></span>
        </Button>
      {/if}
    </div>
    <ul class="m-0 grid list-none gap-px p-0">
      {#each listedPersons as person (person._id)}
        {@const canRemove = !isMembershipReadonly && !unremovableRefs.includes(person._id)}
        <li class="group -mx-2 flex h-9 items-center justify-between gap-2 rounded-md px-2 hover:bg-accent">
          <UserDetails {person} showStatus />
          {#if canRemove}
            <Button
              size="icon-sm"
              variant="ghost"
              class="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              onclick={() => removeMember(person)}
            >
              <X />
              <span class="sr-only"><Label label={view.string.Delete} /></span>
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  {#if channel !== undefined}
    {#key channel._id}
      <EditChannelSettingsTab {channel} />
    {/key}
  {/if}
</DocAside>

<style>
  :global(.channel-aside__section) {
    display: grid;
    gap: 12px;
    padding: 16px;
    border-top: 1px solid var(--theme-divider-color);
  }

  :global(.channel-aside__heading) {
    display: flex;
    gap: 6px;
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--theme-dark-color);
  }
</style>
