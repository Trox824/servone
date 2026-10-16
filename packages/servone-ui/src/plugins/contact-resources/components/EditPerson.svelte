<script lang="ts">
  import {
    Channel,
    Employee,
    Person,
    combineName,
    getCurrentEmployee,
    getFirstName,
    getLastName,
    getName
  } from '@hcengineering/contact'
  import { AccountRole, Ref, getCurrentAccount, hasAccountRole, type AccountUuid } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { AttributeEditor, ComponentExtensions, createQuery, getClient, hasResource } from '@hcengineering/presentation'
  import { resolveManager } from '@servone/notify-rules'
  import ratingPlugin from '@hcengineering/rating'
  import type { PersonRating } from '@hcengineering/rating'
  import setting, { IntegrationType } from '@hcengineering/setting'
  import { Component, EditBox, FocusHandler, Label, Scroller, createFocusManager } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'
  import contact from '../plugin'
  import Avatar from './Avatar.svelte'
  import ChannelsDropdown from './ChannelsDropdown.svelte'
  import ChannelsEditor from './ChannelsEditor.svelte'
  import EditableAvatar from './EditableAvatar.svelte'
  import { employeeByIdStore } from '../utils'
  import { profileDepartment, staffDepartmentOf } from '../../../lib/profile-department'
  import { teamDirectory } from '../../../lib/team-departments'
  import { headDepartment } from '../../../lib/team-mentions'
  import StartJobActions from '../../tracker-resources/workflows/onboarding/StartJobActions.svelte'

  export let object: Person
  export let readonly: boolean = false
  export let channels: Channel[] | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const currentAccount = getCurrentAccount()
  const directory = teamDirectory()
  const focusManager = createFocusManager()
  const integrationsQuery = createQuery()
  const ratingQuery = createQuery()
  const departmentLabel = 'contact:string:ServoneDepartment' as IntlString
  const reportsToLabel = 'contact:string:ServoneReportsTo' as IntlString
  const hasRatingRing = hasResource(ratingPlugin.component.RatingRing)

  let avatarEditor: EditableAvatar | undefined
  let firstNameText = ''
  let lastNameText = ''
  let jobTitleText = ''
  let integrations = new Set<Ref<IntegrationType>>()
  let ratingDoc: PersonRating | undefined

  onMount(() => {
    dispatch('open', { ignoreKeys: ['comments', 'name', 'channels', 'city', 'profile'] })
  })

  $: isEmployee = object !== undefined && hierarchy.hasMixin(object, contact.mixin.Employee)
  $: employeeView = isEmployee ? hierarchy.as(object, contact.mixin.Employee) : undefined
  $: isOwnProfile = object !== undefined && getCurrentEmployee() === object._id
  $: canEdit =
    !readonly &&
    (isOwnProfile || !isEmployee || hasAccountRole(currentAccount, AccountRole.Maintainer))

  $: if (object !== undefined) {
    firstNameText = getFirstName(object.name)
    lastNameText = getLastName(object.name)
    jobTitleText = employeeView?.position ?? ''
  }

  $: staffDepartmentId = object !== undefined ? staffDepartmentOf(hierarchy, object) : undefined
  $: department =
    isEmployee && object !== undefined
      ? profileDepartment(object._id, staffDepartmentId, $directory.departments)
      : undefined
  $: managerId =
    isEmployee && object !== undefined
      ? resolveManager(
        object._id,
        staffDepartmentId ?? headDepartment,
        $directory.departments,
        $directory.active
      )
      : undefined
  $: manager = managerId !== undefined ? $employeeByIdStore.get(managerId as Ref<Employee>) : undefined

  $: integrationsQuery.query(
    setting.class.Integration,
    { createdBy: { $in: currentAccount.socialIds }, disabled: false },
    (found) => {
      integrations = new Set(found.map((integration) => integration.type))
    }
  )

  $: ratingUuid = object?.personUuid
  $: if (ratingUuid != null) {
    ratingQuery.query(
      ratingPlugin.class.PersonRating,
      { accountId: ratingUuid as AccountUuid },
      (found) => {
        ratingDoc = found[0]
      }
    )
  } else {
    ratingQuery.unsubscribe()
    ratingDoc = undefined
  }

  async function saveFirstName (): Promise<void> {
    await client.update(object, { name: combineName(firstNameText, getLastName(object.name)) })
  }

  async function saveLastName (): Promise<void> {
    await client.update(object, { name: combineName(getFirstName(object.name), lastNameText) })
  }

  async function saveJobTitle (): Promise<void> {
    const trimmedTitle = jobTitleText.trim()
    await client.updateMixin(object._id, object._class, object.space, contact.mixin.Employee, {
      position: trimmedTitle === '' ? null : trimmedTitle
    })
  }

  async function replaceAvatar (): Promise<void> {
    if (avatarEditor === undefined) return
    if (object.avatar != null) {
      await avatarEditor.removeAvatar(object.avatar)
    }
    const newAvatarFields = await avatarEditor.createAvatar()
    await client.diffUpdate(object, newAvatarFields)
  }
</script>

<FocusHandler manager={focusManager} />

{#if object !== undefined}
  <div class="flex-row-stretch flex-grow">
    <div class="flex-no-shrink flex-col flex-row-center person-avatar-column">
      {#key object}
        {#if canEdit}
          <EditableAvatar
            bind:this={avatarEditor}
            person={object}
            size={'large'}
            name={object.name}
            on:done={replaceAvatar}
          />
        {:else}
          <Avatar person={object} size={'large'} name={object.name} />
        {/if}
      {/key}
      {#if ratingDoc !== undefined && hasRatingRing}
        <div class="flex-row-center person-rating-row">
          <Component is={ratingPlugin.component.RatingRing} props={{ rating: ratingDoc.rating, showValues: true }} />
        </div>
      {/if}
    </div>

    <div class="flex-col flex-grow min-w-0">
      <div class="person-name-row">
        <EditBox
          kind={'modern-ghost-large'}
          placeholder={contact.string.PersonFirstNamePlaceholder}
          disabled={!canEdit}
          focusIndex={1}
          bind:value={firstNameText}
          on:change={saveFirstName}
        />
        <EditBox
          kind={'modern-ghost-large'}
          placeholder={contact.string.PersonLastNamePlaceholder}
          disabled={!canEdit}
          focusIndex={2}
          bind:value={lastNameText}
          on:change={saveLastName}
        />
      </div>

      {#if isEmployee}
        <div class="person-job-title">
          <EditBox
            kind={'ghost'}
            fullSize
            placeholder={contact.string.Position}
            disabled={!canEdit}
            focusIndex={3}
            bind:value={jobTitleText}
            on:change={saveJobTitle}
          />
        </div>
      {/if}

      {#if department !== undefined || manager !== undefined}
        <p class="person-org-line">
          {#if department !== undefined}
            <span>
              <Label label={departmentLabel} />:
              <span class="person-org-name">{department.name}</span>
            </span>
          {/if}
          {#if manager !== undefined}
            <span>
              <Label label={reportsToLabel} />:
              <span class="person-org-name">{getName(hierarchy, manager)}</span>
            </span>
          {/if}
        </p>
      {/if}

      {#if isEmployee && !isOwnProfile}
        <div class="person-actions-row">
          <ComponentExtensions
            extension={contact.extension.EmployeePopupActions}
            props={{ employee: employeeView, icon: contact.icon.Chat, type: 'type-button' }}
          />
          <StartJobActions person={hierarchy.as(object, contact.mixin.Employee)} isInline={true} />
        </div>
      {/if}

      <div class="person-city-row">
        <AttributeEditor
          maxWidth={'20rem'}
          _class={contact.class.Person}
          {object}
          editable={canEdit}
          key={'city'}
          editKind={'ghost'}
          focusIndex={4}
        />
      </div>

      <Scroller
        contentDirection={'horizontal'}
        padding={'.125rem .125rem .5rem'}
        noStretch
        stickedScrollBars
        thinScrollBars
      >
        {#if channels === undefined}
          <ChannelsEditor
            attachedTo={object._id}
            attachedClass={object._class}
            editable={canEdit}
            bind:integrations
            shape={'circle'}
            focusIndex={10}
          />
        {:else}
          <ChannelsDropdown
            value={channels}
            editable={false}
            kind={'link-bordered'}
            size={'small'}
            length={'full'}
            shape={'circle'}
          />
        {/if}
      </Scroller>
    </div>
  </div>

  {#if ratingDoc !== undefined && hasRatingRing}
    <div class="person-rating-activities">
      <Component is={ratingPlugin.component.RatingActivities} props={{ rating: ratingDoc }} />
    </div>
  {/if}
{/if}

<style lang="scss">
  .person-avatar-column {
    margin-right: 24px;
  }

  .person-rating-row {
    margin-top: 8px;
  }

  .person-rating-activities {
    margin-top: 8px;
  }

  .person-name-row {
    display: flex;
    margin-left: -0.75rem;
    color: var(--foreground);

    > :global(*) {
      flex: 1 1 0;
      min-width: 0;
    }

    :global(input) {
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
  }

  .person-job-title {
    max-width: 20rem;
    margin-left: -0.5rem;
  }

  .person-org-line {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
  }

  .person-org-name {
    color: var(--foreground);
  }

  .person-actions-row {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .person-city-row {
    margin-bottom: 0.75rem;
    margin-left: -0.5rem;
    color: var(--muted-foreground);
  }
</style>
