<script lang="ts">
  import { onMount } from 'svelte'
  import QRCode from 'qrcode'
  import { Analytics } from '@hcengineering/analytics'
  import { getCurrentAccount } from '@hcengineering/core'
  import login from '@hcengineering/login'
  import platform, {
    OK,
    PlatformError,
    getEmbeddedLabel,
    getResource,
    unknownError,
    type IntlString,
    type Status as PlatformStatus
  } from '@hcengineering/platform'
  import presentation from '@hcengineering/presentation'
  import setting from '@hcengineering/setting'
  import { Breadcrumb, Button, EditBox, Header, Icon, Label, Loading, Scroller, Spinner, Status } from '@hcengineering/ui'
  import plugin from '../plugin'
  import { getAccountClient } from '../utils'
  import { intl } from '../../../lib/intl'
  import ErrorIcon from './icons/Error.svelte'

  const TWO_FA_ON_LABEL = 'setting:string:ServoneOn' as IntlString
  const TWO_FA_OFF_LABEL = 'setting:string:ServoneOff' as IntlString
  const TWO_FA_SCAN_HINT = 'setting:string:ServoneTwoFactorScan' as IntlString
  const VERIFICATION_CODE_LENGTH = 6
  const qrAlt = intl('setting:string:ServoneTwoFactorQr' as IntlString)
  const QR_IMAGE_WIDTH = 200

  let hasPassword: boolean | undefined
  let currentPassword = ''
  let newPassword = ''
  let repeatPassword = ''
  let saveState: 'idle' | 'running' | 'done' = 'idle'
  let hasPasswordError = false
  let isLinkRequestRunning = false
  let isLinkSent = false
  let isEmailMissing = false

  let isTwoFactorEnabled: boolean | undefined
  let isSetupOpen = false
  let isTwoFactorBusy = false
  let twoFactorSecret = ''
  let otpauthUrl = ''
  let qrImageUrl = ''
  let verificationCode = ''
  let twoFactorStatus: PlatformStatus = OK

  $: isCheckingPassword = hasPassword === undefined
  $: passwordSectionTitle = hasPassword === false ? login.string.SetPassword : login.string.ChangePassword
  $: noPasswordDescription = isEmailMissing
    ? login.string.SSONoEmailLinked
    : isLinkSent
      ? login.string.SSOPasswordEmailSent
      : login.string.SSOPasswordDescription
  $: saveLabel =
    saveState === 'running' ? setting.string.Saving : saveState === 'done' ? setting.string.Saved : presentation.string.Save
  $: isSaveDisabled =
    isCheckingPassword ||
    newPassword === '' ||
    currentPassword === '' ||
    currentPassword === newPassword ||
    newPassword !== repeatPassword ||
    saveState !== 'idle'
  $: resetSaveState(currentPassword, newPassword, repeatPassword)
  $: if (otpauthUrl !== '') void renderQrImage(otpauthUrl)

  void getAccountClient()
    .getAccountInfo(getCurrentAccount().uuid)
    .then((accountInfo) => {
      isTwoFactorEnabled = accountInfo.tfaEnabled === true
    })

  onMount(async () => {
    try {
      const checkHasPassword = await getResource(login.function.CheckHasPassword)
      hasPassword = await checkHasPassword()
    } catch {
      hasPassword = true
    }
  })

  function resetSaveState (_current: string, _next: string, _repeat: string): void {
    saveState = 'idle'
    hasPasswordError = false
  }

  async function renderQrImage (url: string): Promise<void> {
    qrImageUrl = await QRCode.toDataURL(url, { margin: 1, width: QR_IMAGE_WIDTH })
  }

  function statusFromError (err: unknown): PlatformStatus {
    return err instanceof PlatformError ? err.status : unknownError(err)
  }

  async function requestSetupLink (): Promise<void> {
    isLinkRequestRunning = true
    isEmailMissing = false
    try {
      const requestPasswordSetup = await getResource(login.function.RequestPasswordSetup)
      await requestPasswordSetup()
      isLinkSent = true
    } catch (err) {
      if (err instanceof PlatformError && err.status.code === platform.status.SocialIdNotFound) {
        isEmailMissing = true
      } else {
        Analytics.handleError(err)
        hasPasswordError = true
      }
    } finally {
      isLinkRequestRunning = false
    }
  }

  async function savePassword (): Promise<void> {
    saveState = 'running'
    try {
      const changePassword = await getResource(login.function.ChangePassword)
      await changePassword(currentPassword, newPassword)
      hasPassword = true
      saveState = 'done'
    } catch (err) {
      Analytics.handleError(err)
      saveState = 'idle'
      hasPasswordError = true
    }
  }

  async function startTwoFactorSetup (): Promise<void> {
    if (isTwoFactorEnabled === true) {
      isSetupOpen = true
      return
    }
    isTwoFactorBusy = true
    try {
      const generated = await getAccountClient().generate2faSecret()
      twoFactorSecret = generated.secret
      otpauthUrl = generated.url
      isSetupOpen = true
    } catch (err) {
      twoFactorStatus = statusFromError(err)
    } finally {
      isTwoFactorBusy = false
    }
  }

  async function confirmTwoFactorChange (): Promise<void> {
    isTwoFactorBusy = true
    const isTurningOn = isTwoFactorEnabled !== true
    try {
      const accountClient = getAccountClient()
      if (isTurningOn) {
        await accountClient.enable2fa(twoFactorSecret, verificationCode)
      } else {
        await accountClient.disable2fa(verificationCode)
      }
      isTwoFactorEnabled = isTurningOn
      closeSetup()
    } catch (err) {
      twoFactorStatus = statusFromError(err)
    } finally {
      isTwoFactorBusy = false
    }
  }

  function closeSetup (): void {
    isSetupOpen = false
    verificationCode = ''
    twoFactorStatus = OK
  }
</script>

<div class="hulyComponent">
  <Header adaptive="disabled">
    <Breadcrumb icon={setting.icon.Password} label={setting.string.Security} size="large" isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-2xl flex-col p-6">
      <div class="flex flex-col gap-4">
        <span class="text-sm font-medium text-foreground"><Label label={passwordSectionTitle} /></span>
        {#if isCheckingPassword}
          <Loading />
        {:else}
          {#if hasPasswordError}
            <div class="flex items-center gap-2 text-sm text-destructive">
              <Icon icon={ErrorIcon} size="small" />
              <Label label={plugin.string.FailedToSave} />
            </div>
          {/if}
          {#if hasPassword === false}
            <p class="m-0 text-sm text-muted-foreground"><Label label={noPasswordDescription} /></p>
            {#if !isEmailMissing && !isLinkSent}
              <div>
                <Button
                  kind="primary"
                  label={login.string.SendSetupLink}
                  disabled={isLinkRequestRunning}
                  on:click={requestSetupLink}
                />
              </div>
            {/if}
          {:else}
            <div class="flex w-full max-w-md flex-col gap-4">
              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-muted-foreground"><Label label={login.string.CurrentPassword} /></span>
                <EditBox format="password" fullSize placeholder={getEmbeddedLabel('')} bind:value={currentPassword} />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-muted-foreground"><Label label={login.string.NewPassword} /></span>
                <EditBox format="password" fullSize placeholder={getEmbeddedLabel('')} bind:value={newPassword} />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="text-sm text-muted-foreground"><Label label={login.string.RepeatNewPassword} /></span>
                <EditBox format="password" fullSize placeholder={getEmbeddedLabel('')} bind:value={repeatPassword} />
              </div>
            </div>
            <div>
              <Button kind="primary" label={saveLabel} disabled={isSaveDisabled} on:click={savePassword} />
            </div>
          {/if}
        {/if}
      </div>

      <div class="mt-6 flex flex-col gap-4 border-t border-border pt-6">
        <div class="flex flex-col gap-1.5">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-medium text-foreground"><Label label={setting.string.TwoFactorAuth} /></span>
            {#if isTwoFactorEnabled !== undefined}
              <span
                class="text-xs font-normal"
                class:text-emerald-600={isTwoFactorEnabled}
                class:text-muted-foreground={!isTwoFactorEnabled}
              >
                <Label label={isTwoFactorEnabled ? TWO_FA_ON_LABEL : TWO_FA_OFF_LABEL} />
              </span>
            {/if}
          </div>
          <p class="m-0 text-sm text-muted-foreground"><Label label={setting.string.TwoFactorAuthDescription} /></p>
        </div>

        {#if isTwoFactorEnabled === undefined}
          <div><Spinner size="small" /></div>
        {:else if !isSetupOpen}
          <div>
            <Button
              kind={isTwoFactorEnabled ? 'dangerous' : 'primary'}
              label={isTwoFactorEnabled ? setting.string.DisableTwoFactorAuth : setting.string.EnableTwoFactorAuth}
              disabled={isTwoFactorBusy}
              on:click={startTwoFactorSetup}
            />
          </div>
        {:else}
          {#if !isTwoFactorEnabled}
            <div class="flex items-start gap-4">
              <div class="size-40 shrink-0 overflow-hidden rounded-md bg-white">
                {#if qrImageUrl !== ''}
                  <img class="size-full" src={qrImageUrl} alt={$qrAlt} />
                {/if}
              </div>
              <div class="flex min-w-0 flex-col gap-2">
                <span class="text-sm text-muted-foreground"><Label label={TWO_FA_SCAN_HINT} /></span>
                <code class="break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs text-foreground">
                  {twoFactorSecret}
                </code>
              </div>
            </div>
          {/if}
          <div class="flex flex-col gap-1.5">
            <span class="text-sm text-muted-foreground"><Label label={setting.string.EnterVerificationCode} /></span>
            <div class="flex items-center gap-2">
              <EditBox
                bind:value={verificationCode}
                maxWidth="7rem"
                placeholder={getEmbeddedLabel('000000')}
                autoFocus
              />
              <Button
                kind={isTwoFactorEnabled ? 'dangerous' : 'primary'}
                label={presentation.string.Save}
                disabled={isTwoFactorBusy || verificationCode.length !== VERIFICATION_CODE_LENGTH}
                on:click={confirmTwoFactorChange}
              />
              <Button label={presentation.string.Cancel} disabled={isTwoFactorBusy} on:click={closeSetup} />
              <Status status={twoFactorStatus} />
            </div>
          </div>
        {/if}
      </div>
    </div>
  </Scroller>
</div>
