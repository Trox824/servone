<script lang="ts">
  import { AvatarType } from '@hcengineering/contact'
  import { EditableAvatar, getAccountClient } from '@hcengineering/contact-resources'
  import core, { type Blob, type Ref } from '@hcengineering/core'
  import { loginId } from '@hcengineering/login'
  import { type IntlString } from '@hcengineering/platform'
  import presentation, { getClient, MessageBox } from '@hcengineering/presentation'
  import { type WorkspaceSetting } from '@hcengineering/setting'
  import { Breadcrumb, Header, Label, Loading, navigate, Scroller, showPopup } from '@hcengineering/ui'
  import settingsRes from '../plugin'
  import { intl } from '../../../lib/intl'
  import { Button } from '../../../lib/components/ui/button'
  import { Input } from '../../../lib/components/ui/input'
  import { Separator } from '../../../lib/components/ui/separator'
  import { Switch } from '../../../lib/components/ui/switch'

  const MAX_NAME_LENGTH = 40
  const DEFAULT_AGING_DAYS = 30
  const FORBIDDEN_NAME_CHARS = /[\n<>/\\]/
  const NAME_HINT = 'setting:string:ServoneWorkspaceNameHint' as IntlString
  const RENAME = 'setting:string:ServoneRename' as IntlString
  const EVERY = 'setting:string:ServonePasswordAgingEvery' as IntlString
  const DAYS_UNIT = 'setting:string:ServonePasswordAgingDaysUnit' as IntlString
  const DELETE_WARNING = 'setting:string:ServoneDeleteWorkspaceWarning' as IntlString
  const workspaceNameText = intl('setting:string:ServoneWorkspaceName' as IntlString)
  const agingRuleText = intl(settingsRes.string.PasswordAgingRule)
  const agingDaysText = intl('setting:string:ServonePasswordAgingDays' as IntlString)

  const accountClient = getAccountClient()
  const client = getClient()

  let isLoading = true
  let savedWorkspaceName = ''
  let editableWorkspaceName = ''
  let isEditingName = false
  let passwordAgingDays: number | undefined
  let workspaceSetting: WorkspaceSetting | undefined
  let avatarEditor: EditableAvatar

  $: trimmedName = editableWorkspaceName.trim()
  $: canSaveName =
    trimmedName.length > 0 &&
    trimmedName !== savedWorkspaceName &&
    trimmedName.length <= MAX_NAME_LENGTH &&
    !FORBIDDEN_NAME_CHARS.test(editableWorkspaceName)
  $: avatarPerson = {
    avatarType: workspaceSetting?.icon !== undefined ? AvatarType.IMAGE : AvatarType.COLOR,
    avatar: workspaceSetting?.icon
  }

  void accountClient.getWorkspaceInfo().then((workspaceInfo) => {
    savedWorkspaceName = workspaceInfo.name
    editableWorkspaceName = workspaceInfo.name
    passwordAgingDays = workspaceInfo.passwordAgingRule ?? undefined
    isLoading = false
  })

  void client.findOne(settingsRes.class.WorkspaceSetting, {}).then((foundSetting) => {
    workspaceSetting = foundSetting
  })

  async function handleAvatarDone (): Promise<void> {
    const existingSetting = await client.findOne(settingsRes.class.WorkspaceSetting, {
      _id: settingsRes.ids.WorkspaceSetting
    })
    const createdAvatar = await avatarEditor.createAvatar()
    const newIcon = (createdAvatar.avatar ?? null) as Ref<Blob> | null
    if (existingSetting === undefined) {
      await client.createDoc(
        settingsRes.class.WorkspaceSetting,
        core.space.Workspace,
        { icon: newIcon },
        settingsRes.ids.WorkspaceSetting
      )
      return
    }
    if (existingSetting.icon != null && existingSetting.icon !== newIcon) {
      await avatarEditor.removeAvatar(existingSetting.icon)
    }
    await client.diffUpdate(existingSetting, { icon: createdAvatar.avatarType === AvatarType.IMAGE ? newIcon : null })
  }

  async function saveName (): Promise<void> {
    if (!canSaveName) return
    await accountClient.updateWorkspaceName(trimmedName)
    savedWorkspaceName = trimmedName
    isEditingName = false
  }

  function cancelRename (): void {
    editableWorkspaceName = savedWorkspaceName
    isEditingName = false
  }

  function handleNameKeydown (event: KeyboardEvent): void {
    if (event.key === 'Enter') void saveName()
    else if (event.key === 'Escape') cancelRename()
  }

  async function setPasswordAging (days: number | undefined): Promise<void> {
    passwordAgingDays = days
    await accountClient.updatePasswordAgingRule(days)
  }

  function handleAgingSwitch (isOn: boolean): void {
    void setPasswordAging(isOn ? DEFAULT_AGING_DAYS : undefined)
  }

  function handleAgingDaysChange (event: Event): void {
    const parsedDays = parseInt((event.currentTarget as HTMLInputElement).value, 10)
    if (Number.isNaN(parsedDays)) return
    void setPasswordAging(Math.max(1, parsedDays))
  }

  function confirmDeleteWorkspace (): void {
    showPopup(MessageBox, {
      label: settingsRes.string.DeleteWorkspace,
      message: settingsRes.string.DeleteWorkspaceConfirm,
      dangerous: true,
      action: async () => {
        await accountClient.deleteWorkspace()
        navigate({ path: [loginId] })
      }
    })
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={settingsRes.icon.Setting} label={settingsRes.string.General} size={'large'} isCurrent />
  </Header>
  {#if isLoading}
    <div class="flex h-full w-full items-center justify-center">
      <Loading />
    </div>
  {:else}
    <Scroller>
      <div class="mx-auto w-full max-w-2xl p-6">
        <section class="flex flex-col gap-3">
          <h2 class="text-sm font-medium text-foreground"><Label label={settingsRes.string.Workspace} /></h2>
          <p class="text-sm text-muted-foreground"><Label label={NAME_HINT} /></p>
          <div class="flex items-center gap-4">
            <EditableAvatar
              bind:this={avatarEditor}
              person={avatarPerson}
              size={'medium'}
              name={editableWorkspaceName}
              imageOnly
              lessCrop
              on:done={handleAvatarDone}
            />
            <Input
              class="max-w-xs"
              bind:value={editableWorkspaceName}
              readonly={!isEditingName}
              maxlength={MAX_NAME_LENGTH}
              placeholder={$workspaceNameText}
              aria-label={$workspaceNameText}
              onkeydown={handleNameKeydown}
            />
            {#if isEditingName}
              <Button size="sm" disabled={!canSaveName} onclick={() => void saveName()}><Label label={presentation.string.Save} /></Button>
              <Button variant="ghost" size="sm" onclick={cancelRename}><Label label={presentation.string.Cancel} /></Button>
            {:else}
              <Button variant="outline" size="sm" onclick={() => (isEditingName = true)}><Label label={RENAME} /></Button>
            {/if}
          </div>
        </section>

        <Separator class="my-6" />

        <section class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col gap-1">
              <h2 class="text-sm font-medium text-foreground">
                <Label label={settingsRes.string.PasswordAgingRule} />
              </h2>
              <p class="text-sm text-muted-foreground">
                <Label label={settingsRes.string.PasswordAgingRuleDescription} />
              </p>
            </div>
            <Switch
              checked={passwordAgingDays !== undefined}
              onCheckedChange={handleAgingSwitch}
              aria-label={$agingRuleText}
            />
          </div>
          {#if passwordAgingDays !== undefined}
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <span><Label label={EVERY} /></span>
              <Input
                class="w-20"
                type="number"
                min={1}
                value={passwordAgingDays}
                aria-label={$agingDaysText}
                onchange={handleAgingDaysChange}
              />
              <span><Label label={DAYS_UNIT} /></span>
            </div>
          {/if}
        </section>

        <Separator class="my-6" />

        <section class="flex flex-col gap-3">
          <h2 class="text-sm font-medium text-destructive"><Label label={settingsRes.string.DangerZone} /></h2>
          <div
            class="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 p-4 text-sm text-muted-foreground"
          >
            <span><Label label={DELETE_WARNING} /></span>
            <Button variant="destructive" size="sm" onclick={confirmDeleteWorkspace}>
              <Label label={settingsRes.string.DeleteWorkspace} />
            </Button>
          </div>
        </section>
      </div>
    </Scroller>
  {/if}
</div>
