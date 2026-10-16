<script lang="ts">
  import { getName, getWorkspaceMemberStatusSubtitle, type Employee } from '@hcengineering/contact'
  import type { AccountUuid, Class, Doc, Ref } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { ComponentExtensions, createQuery, getClient, hasResource } from '@hcengineering/presentation'
  import rating, { type PersonRating } from '@hcengineering/rating'
  import { ButtonIcon, Component, Label, navigate, themeStore } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { getObjectLinkFragment } from '@hcengineering/view-resources'
  import { resolveManager } from '@servone/notify-rules'
  import { EmployeePresenter, getPersonByPersonRefStore } from '../../index'
  import contact from '../../plugin'
  import { employeeByIdStore } from '../../utils'
  import { workspaceMemberStatusByAccountStore } from '../../workspaceMemberStatus'
  import { formatPauseTime, minuteClock, pauseString, readPause } from '../../../../lib/notify/pause'
  import { profileDepartment, staffDepartmentOf } from '../../../../lib/profile-department'
  import { formatHours, hoursAheadOfViewer } from '../../../../lib/profile-time'
  import { teamDirectory } from '../../../../lib/team-departments'
  import { headDepartment } from '../../../../lib/team-mentions'
  import Avatar from '../Avatar.svelte'
  import DeactivatedHeader from './DeactivatedHeader.svelte'
  import ModernProfilePopup from './ModernProfilePopup.svelte'
  import TimePresenter from './TimePresenter.svelte'

  export let _id: Ref<Employee>
  export let disabled: boolean = false

  const departmentLabel = 'contact:string:ServoneDepartment' as IntlString
  const reportsToLabel = 'contact:string:ServoneReportsTo' as IntlString
  const hoursAheadLabel = 'contact:string:ServoneHoursAhead' as IntlString
  const hoursBehindLabel = 'contact:string:ServoneHoursBehind' as IntlString

  const hierarchy = getClient().getHierarchy()
  const directory = teamDirectory()
  const hasRatingUi = hasResource(rating.component.RatingRing)
  const ratingQuery = createQuery()

  let ratingDoc: PersonRating | undefined = undefined

  $: personByRefStore = getPersonByPersonRefStore([_id])
  $: employee = $employeeByIdStore.get(_id)
  $: isEmployee = employee !== undefined
  $: person = (employee ?? $personByRefStore.get(_id))
  $: personUuid = person?.personUuid
  $: timezone = employee?.timezone
  $: jobTitle = employee?.position ?? undefined

  $: if (personUuid != null) {
    ratingQuery.query(rating.class.PersonRating, { accountId: personUuid as AccountUuid }, (found) => {
      ratingDoc = found[0]
    })
  } else {
    ratingDoc = undefined
    ratingQuery.unsubscribe()
  }

  $: memberStatus = personUuid != null ? $workspaceMemberStatusByAccountStore.get(personUuid as AccountUuid) : undefined
  $: statusMessage = personUuid != null ? getWorkspaceMemberStatusSubtitle(memberStatus) : undefined

  $: staffDepartment = isEmployee && person !== undefined ? staffDepartmentOf(hierarchy, person) : undefined
  $: departmentName =
    isEmployee && person !== undefined
      ? profileDepartment(person._id, staffDepartment, $directory.departments)?.name
      : undefined
  $: managerId =
    isEmployee && person !== undefined
      ? resolveManager(person._id, staffDepartment ?? headDepartment, $directory.departments, $directory.active)
      : undefined
  $: manager = managerId !== undefined ? $employeeByIdStore.get(managerId as Ref<Employee>) : undefined
  $: managerName = manager !== undefined ? getName(hierarchy, manager) : undefined

  $: hoursOffset = timezone !== undefined ? hoursAheadOfViewer(timezone, $minuteClock) : undefined
  $: pausedUntil = personUuid != null ? readPause(memberStatus)?.until : undefined
  $: isPaused = pausedUntil !== undefined && $minuteClock < pausedUntil
  $: pauseText = pausedUntil !== undefined ? formatPauseTime(pausedUntil, $minuteClock, $themeStore.language) : ''

  async function openProfile (): Promise<void> {
    if (person === undefined) return
    const panel = hierarchy.classHierarchyMixin(person._class as Ref<Class<Doc>>, view.mixin.ObjectPanel)
    const panelComponent = panel?.component ?? view.component.EditDoc
    const target = await getObjectLinkFragment(hierarchy, person, {}, panelComponent)
    navigate(target)
  }
</script>

<ModernProfilePopup {disabled}>
  <div slot="header">
    {#if disabled}
      <div class="flex items-center">
        <DeactivatedHeader>
          <div slot="actions" class="flex items-center gap-2">
            <ComponentExtensions
              extension={contact.extension.EmployeePopupActions}
              props={{ employee: person, icon: contact.icon.Chat, type: 'type-button-icon' }}
            />
            <ButtonIcon icon={contact.icon.User} size="small" iconSize="small" on:click={openProfile} />
          </div>
        </DeactivatedHeader>
      </div>
    {/if}
  </div>

  <div slot="actions">
    {#if !disabled}
      <div class="flex items-center gap-2">
        <ComponentExtensions
          extension={contact.extension.EmployeePopupActions}
          props={{ employee: person, icon: contact.icon.Chat, type: 'type-button', class: 'button-container' }}
        />
        <div class="profile-button-box">
          <ButtonIcon icon={contact.icon.User} size="small" iconSize="small" on:click={openProfile} />
        </div>
      </div>
    {/if}
  </div>

  <div slot="content">
    {#if disabled}
      <div class="flex items-center gap-2 p-2">
        <div class="flex">
          <Avatar
            size="large"
            {person}
            name={person?.name}
            {disabled}
            style="modern"
            clickable
            on:click={openProfile}
          />
        </div>
        <div class="flex flex-col">
          <EmployeePresenter value={person} shouldShowAvatar={false} showPopup={false} compact accent />
        </div>
      </div>
    {:else}
      <div class="flex items-center gap-2 p-3 cursor-default">
        <Avatar
          size="large"
          {person}
          name={person?.name}
          {disabled}
          showStatus={isEmployee}
          statusSize="medium"
          style="modern"
          clickable
          on:click={openProfile}
        />
        <div class="flex flex-col gap-0.5 pl-1 min-w-0">
          {#if statusMessage}
            <span class="status-chip max-w-60">
              <span class="status-chip-text text-normal font-normal content-color overflow-label">
                {statusMessage}
              </span>
            </span>
          {/if}
          <EmployeePresenter
            value={person}
            shouldShowAvatar={false}
            showPopup={false}
            compact
            accent
            showWorkspaceStatusEmoji={false}
          />
          {#if hasRatingUi}
            <div class="flex items-center text-sm">
              <Component
                is={rating.component.RatingRing}
                props={{ rating: ratingDoc?.rating ?? 0, showValues: false }}
              />
            </div>
          {/if}
          {#if jobTitle}
            <span class="text-sm content-color overflow-label max-w-60">{jobTitle}</span>
          {/if}
          {#if departmentName}
            <span class="text-sm content-dark-color overflow-label max-w-60">
              <Label label={departmentLabel} />: {departmentName}
            </span>
          {/if}
          {#if managerName}
            <span class="text-sm content-dark-color overflow-label max-w-60">
              <Label label={reportsToLabel} />: {managerName}
            </span>
          {/if}
          <span class="inline-flex cursor-default">
            <TimePresenter {timezone} />
          </span>
          {#if hoursOffset !== undefined && hoursOffset !== 0}
            <span class="text-sm content-dark-color">
              <Label
                label={hoursOffset > 0 ? hoursAheadLabel : hoursBehindLabel}
                params={{ hours: formatHours(hoursOffset) }}
              />
            </span>
          {/if}
          {#if isPaused}
            <span class="text-sm content-dark-color overflow-label max-w-60">
              <Label label={pauseString.NotificationsPausedUntil} params={{ time: pauseText }} />
            </span>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</ModernProfilePopup>

<style>
  .status-chip {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    align-self: flex-start;
    min-width: 0;
    min-height: 1.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: var(--medium-BorderRadius);
    background: color-mix(in srgb, var(--theme-popup-color) 72%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--theme-popup-color) 55%, var(--theme-divider-color));
  }

  .status-chip-text {
    min-width: 0;
    line-height: 1.25;
  }

  .profile-button-box {
    display: flex;
    border-radius: var(--small-BorderRadius);
    background-color: var(--theme-button-container-color);
  }
</style>
