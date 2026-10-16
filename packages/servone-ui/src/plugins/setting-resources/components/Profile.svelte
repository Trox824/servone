<script lang="ts">
  import contact, { combineName, getFirstName, getLastName } from '@hcengineering/contact'
  import { ChannelsEditor, EditableAvatar, myEmployeeStore } from '@hcengineering/contact-resources'
  import contactResources from '@hcengineering/contact-resources/src/plugin'
  import { AccountRole, getCurrentAccount, SocialIdType } from '@hcengineering/core'
  import login, { loginId } from '@hcengineering/login'
  import platform, { getResource, type IntlString, PlatformError } from '@hcengineering/platform'
  import { AttributeEditor, createQuery, getClient, hasResource, MessageBox } from '@hcengineering/presentation'
  import rating, { type PersonRating } from '@hcengineering/rating'
  import {
    Breadcrumb,
    Component,
    createFocusManager,
    EditBox,
    FocusHandler,
    Header,
    Label,
    navigate,
    Scroller,
    showPopup
  } from '@hcengineering/ui'
  import { logIn, logOut } from '@hcengineering/workbench-resources'
  import { LogOut } from '@lucide/svelte'
  import { Button } from '../../../lib/components/ui/button'
  import setting from '../plugin'
  import SocialIdsEditor from './socialIds/SocialIdsEditor.svelte'

  const client = getClient()
  const profileHeadingLabel = 'contact:string:Profile' as IntlString
  const signedInAccount = getCurrentAccount()
  const accountEmail =
    signedInAccount.fullSocialIds.find((socialId) => socialId.type === SocialIdType.EMAIL)?.value ?? ''
  const isRatingAvailable = hasResource(rating.component.RatingRing)
  const keyboardFocus = createFocusManager()

  let ownerScoreRecord: PersonRating | undefined
  let typedGivenName = ''
  let typedFamilyName = ''
  let wereNamesPrefilled = false
  let ownAvatarEditor: EditableAvatar

  createQuery().query(rating.class.PersonRating, { accountId: signedInAccount.uuid }, (foundScores) => {
    ownerScoreRecord = foundScores[0]
  })

  function prefillNamesOnce (fullName: string | undefined): void {
    if (wereNamesPrefilled || fullName === undefined) return
    wereNamesPrefilled = true
    typedGivenName = getFirstName(fullName)
    typedFamilyName = getLastName(fullName)
  }

  $: prefillNamesOnce($myEmployeeStore?.name)

  async function saveNameChange (): Promise<void> {
    const loadedEmployee = $myEmployeeStore
    if (loadedEmployee === undefined) return
    await client.diffUpdate(loadedEmployee, { name: combineName(typedGivenName, typedFamilyName) })
  }

  async function replaceAvatar (): Promise<void> {
    const loadedEmployee = $myEmployeeStore
    if (loadedEmployee === undefined) return
    if (loadedEmployee.avatar != null) {
      await ownAvatarEditor.removeAvatar(loadedEmployee.avatar)
    }
    const newAvatarFields = await ownAvatarEditor.createAvatar()
    await client.diffUpdate(loadedEmployee, newAvatarFields)
  }

  async function leaveCurrentWorkspace (): Promise<void> {
    const leaveWorkspace = await getResource(login.function.LeaveWorkspace)
    let leaveOutcome: Awaited<ReturnType<typeof leaveWorkspace>>
    try {
      leaveOutcome = await leaveWorkspace(signedInAccount.uuid)
    } catch (leaveError) {
      const isLastOwner =
        leaveError instanceof PlatformError &&
        leaveError.status.code === platform.status.Forbidden &&
        signedInAccount.role === AccountRole.Owner
      if (!isLastOwner) throw leaveError
      showPopup(MessageBox, {
        label: setting.string.LastOwnerLeaveTitle,
        message: setting.string.LastOwnerLeaveMessage,
        canSubmit: false
      })
      return
    }

    const switchTarget = leaveOutcome?.token != null ? leaveOutcome : undefined
    await (switchTarget !== undefined ? logIn(switchTarget) : logOut())
    navigate({ path: switchTarget !== undefined ? [loginId, 'selectWorkspace'] : [loginId] })
  }

  function askToLeave (): void {
    showPopup(MessageBox, {
      label: setting.string.Leave,
      message: setting.string.LeaveDescr,
      action: leaveCurrentWorkspace
    })
  }
</script>

<FocusHandler manager={keyboardFocus} />

<div class="hulyComponent">
  <Header adaptive="disabled">
    <Breadcrumb
      icon={setting.icon.AccountSettings}
      label={setting.string.AccountSettings}
      size="large"
      isCurrent
    />
  </Header>

  <Scroller>
    <div class="ac-body servone-profile mx-auto flex w-full max-w-2xl flex-col p-6">
      {#if $myEmployeeStore !== undefined}
        <div class="flex flex-col gap-4">
          <div class="text-sm font-medium text-foreground"><Label label={profileHeadingLabel} /></div>
          <div class="flex items-start gap-5">
            <div class="flex shrink-0 flex-col items-center gap-2">
              <EditableAvatar
                bind:this={ownAvatarEditor}
                person={$myEmployeeStore}
                email={accountEmail}
                size="large"
                name={$myEmployeeStore.name}
                on:done={replaceAvatar}
              />
              {#if isRatingAvailable}
                <Component
                  is={rating.component.RatingRing}
                  props={{ rating: ownerScoreRecord?.rating ?? 0, showValues: true }}
                />
              {/if}
            </div>
            <div class="flex min-w-0 flex-1 flex-col gap-4">
              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-muted-foreground">
                  <Label label={contact.string.PersonFirstNamePlaceholder} />
                </span>
                <EditBox
                  placeholder={contact.string.PersonFirstNamePlaceholder}
                  bind:value={typedGivenName}
                  autoFocus
                  fullSize
                  focusIndex={1}
                  on:change={saveNameChange}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-muted-foreground">
                  <Label label={contact.string.PersonLastNamePlaceholder} />
                </span>
                <EditBox
                  placeholder={contact.string.PersonLastNamePlaceholder}
                  bind:value={typedFamilyName}
                  fullSize
                  focusIndex={2}
                  on:change={saveNameChange}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-muted-foreground"><Label label={contactResources.string.Location} /></span>
                <AttributeEditor
                  _class={contact.class.Person}
                  object={$myEmployeeStore}
                  key="city"
                  editKind="editbox"
                  maxWidth="100%"
                  focusIndex={3}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-muted-foreground"><Label label={contactResources.string.SocialLinks} /></span>
                <ChannelsEditor
                  attachedTo={$myEmployeeStore._id}
                  attachedClass={$myEmployeeStore._class}
                  focusIndex={10}
                  allowOpen={false}
                  restricted={[contact.channelProvider.Email]}
                />
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if isRatingAvailable && ownerScoreRecord !== undefined}
        <div class="mt-6 border-t border-border pt-6">
          <Component is={rating.component.RatingActivities} props={{ rating: ownerScoreRecord }} />
        </div>
      {/if}

      <div class="mt-6 border-t border-border pt-6">
        <SocialIdsEditor rating={ownerScoreRecord} />
      </div>

      <div class="mt-6 flex flex-col gap-3 border-t border-border pt-6">
        <div class="text-sm font-medium text-foreground"><Label label={setting.string.DangerZone} /></div>
        <div>
          <Button variant="destructive" size="sm" onclick={askToLeave}>
            <LogOut />
            <Label label={setting.string.Leave} />
          </Button>
        </div>
      </div>
    </div>
  </Scroller>
</div>
