<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { signupStore } from '@hcengineering/analytics-providers'
  import { type IntlString, OK, PlatformError, Severity, Status, getMetadata, setMetadata } from '@hcengineering/platform'
  import presentation from '@hcengineering/presentation'
  import { Button, Label, Loading, deviceOptionsStore, getCurrentLocation } from '@hcengineering/ui'
  import { logIn, workbenchId } from '@hcengineering/workbench'
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { loginAction, recoveryAction } from '../actions'
  import { loginFormMinHeight, loginFormPadding } from '../loginFormLayout'
  import login from '../plugin'
  import {
    checkJoined,
    getInviteWorkspaceName,
    getLoginInfo,
    goTo,
    join,
    joinByToken,
    setLoginInfo,
    signUpJoin
  } from '../utils'
  import Form from './Form.svelte'
  import LegalAgreement from './LegalAgreement.svelte'
  import StatusControl from './StatusControl.svelte'
  import { termsAccepted } from './termsConsent'

  const startLocation = getCurrentLocation()
  const inviteId = startLocation.query?.inviteId
  const workspace = startLocation.query?.workspace

  Analytics.handleEvent('invite_link_activated', { invite_id: inviteId })

  const connectingStatus = (): Status => new Status(Severity.INFO, login.status.ConnectingToServer, {})

  const logInFields = [
    { id: 'email', name: 'username', i18n: login.string.Email },
    { id: 'current-password', name: 'password', i18n: login.string.Password, password: true }
  ]
  const termsRule = {
    rule: () => get(termsAccepted),
    notMatch: false,
    ruleDescr: 'ui:string:ServoneLoginTermsRequired' as IntlString
  }
  const signUpFields = [
    { id: 'given-name', name: 'first', i18n: login.string.FirstName, short: true },
    { id: 'family-name', name: 'last', i18n: login.string.LastName, short: true },
    { id: 'email', name: 'username', i18n: login.string.Email },
    { id: 'new-password', name: 'password', i18n: login.string.Password, password: true },
    { id: 'new-password', name: 'password2', i18n: login.string.PasswordRepeat, password: true, rules: [termsRule] }
  ]

  const formValues = { first: '', last: '', username: '', password: '', password2: '' }

  let isSignUp = getMetadata(presentation.metadata.Token) == null
  let status: Status = OK
  let formInstance: Form | undefined
  let isChecking = true
  let isPanelOpen = false
  let isJoining = false
  let workspaceName: string | undefined
  let signedInName: string | undefined | null

  $: signupStore.setSignUpFlow(isSignUp)
  $: activeFields = isSignUp ? signUpFields : logInFields
  $: if ($termsAccepted !== undefined) formInstance?.invalidate()
  $: footerActions = buildFooterActions(signedInName)

  function openWorkspace (workspaceUrl: string): void {
    window.location.assign('/' + workbenchId + '/' + workspaceUrl)
  }

  function statusFromError (err: unknown): Status {
    return err instanceof PlatformError ? err.status : new Status(Severity.ERROR, login.status.ConnectingToServer, {})
  }

  async function openPanelForCurrentAccount (): Promise<void> {
    if (signedInName == null) {
      console.error('Current account is not found')
      return
    }
    try {
      const info = await getLoginInfo()
      if (info != null) {
        isPanelOpen = true
      }
    } catch {}
  }

  function buildFooterActions (knownName: string | undefined | null): (typeof loginAction)[] {
    const actions = [loginAction]
    if (knownName != null) {
      actions.push({
        caption: login.string.UseCurrentAccountToJoin,
        i18n: login.string.JoinWithThisAccount,
        page: undefined,
        func: () => {
          void openPanelForCurrentAccount()
        }
      })
    }
    actions.push(recoveryAction)
    return actions
  }

  onMount(async () => {
    if (inviteId == null) {
      isChecking = false
      return
    }
    status = connectingStatus()
    const [joinedInfo, inviteWorkspaceName] = await Promise.all([
      checkJoined(inviteId),
      getInviteWorkspaceName(inviteId)
    ])
    workspaceName = inviteWorkspaceName
    status = OK

    if (joinedInfo != null) {
      setLoginInfo(joinedInfo)
      openWorkspace(joinedInfo.workspaceUrl)
      return
    }

    try {
      const sessionInfo = await getLoginInfo()
      if (sessionInfo != null) {
        isPanelOpen = true
        signedInName = sessionInfo.name
        if (sessionInfo.token != null) {
          setMetadata(presentation.metadata.Token, sessionInfo.token)
        }
      }
    } catch {}
    isChecking = false
  })

  async function joinWithCurrentAccount (): Promise<void> {
    if (inviteId == null) return
    isJoining = true
    status = connectingStatus()
    try {
      const joinedInfo = await joinByToken(inviteId)
      await logIn(joinedInfo)
      setLoginInfo(joinedInfo)
      openWorkspace(joinedInfo.workspaceUrl)
    } catch (err) {
      status = statusFromError(err)
    } finally {
      isJoining = false
    }
  }

  function useDifferentAccount (): void {
    setMetadata(presentation.metadata.Token, null)
    isPanelOpen = false
    isSignUp = false
  }

  async function submitJoinForm (): Promise<void> {
    status = connectingStatus()
    const { username, password, first, last } = formValues
    const [resultStatus, joinedInfo] = isSignUp
      ? await signUpJoin(username, password, first, last, inviteId ?? '', workspace ?? '')
      : await join(username, password, inviteId ?? '', workspace ?? '')
    status = resultStatus

    if (joinedInfo == null) return
    if (joinedInfo.token == null) {
      goTo('confirmationSend')
      return
    }
    try {
      await logIn(joinedInfo)
      setLoginInfo(joinedInfo)
      openWorkspace(joinedInfo.workspaceUrl)
    } catch (err) {
      status = statusFromError(err)
    }
  }

  $: primaryAction = {
    i18n: isSignUp ? login.string.SignUpAndJoin : login.string.LogInAndJoin,
    func: submitJoinForm
  }
  $: toggleLabel = isSignUp ? login.string.HaveAccount : login.string.CreateNewAccount
  $: panelPadding = loginFormPadding($deviceOptionsStore.docWidth, $deviceOptionsStore.docHeight)
  $: panelMinHeight = loginFormMinHeight($deviceOptionsStore.docHeight)
</script>

{#if isChecking}
  <div class="flex-row-center self-center text-foreground gap-4 p-8">
    <Loading size={'small'} shrink />
    <Label label={login.string.ProcessingInvite} />
  </div>
{:else if isPanelOpen}
  <div class="flex-col overflow-hidden" style:padding={panelPadding} style:min-height={panelMinHeight}>
    <div class="flex-col flex-grow gap-1">
      <div class="text-xl font-medium text-foreground">
        <Label label={login.string.JoinWorkspace} params={{ workspaceName: workspaceName ?? '' }} />
      </div>
      {#if signedInName != null && signedInName !== ''}
        <div class="pb-4 text-foreground" style:font-size="0.95rem">
          <Label label={login.string.SignedInAs} params={{ name: signedInName }} />
        </div>
      {/if}
      {#if status.severity !== Severity.OK}
        <div class="mb-4">
          <StatusControl {status} />
        </div>
      {/if}
      <div class="flex-col gap-4 w-full">
        <Button
          dataId="join-with-this-account"
          label={login.string.Join}
          kind="contrast"
          shape="round2"
          size="large"
          width="100%"
          loading={isJoining}
          disabled={isJoining}
          on:click={joinWithCurrentAccount}
        />
        <Button
          dataId="join-use-different-account"
          label={login.string.UseDifferentAccount}
          shape="round2"
          size="large"
          width="100%"
          disabled={isJoining}
          on:click={useDifferentAccount}
        />
      </div>
    </div>
  </div>
{:else}
  <Form
    bind:this={formInstance}
    caption={login.string.JoinWorkspace}
    captionParams={{ workspaceName: workspaceName ?? '' }}
    actionButtonDataId="join-form-submit"
    secondaryButtonDataId="join-form-toggle"
    {status}
    fields={activeFields}
    object={formValues}
    action={primaryAction}
    secondaryButtonLabel={toggleLabel}
    secondaryButtonAction={() => {
      isSignUp = !isSignUp
    }}
    bottomActions={footerActions}
    withProviders
  >
    <svelte:fragment slot="extra-fields">
      {#if isSignUp}<LegalAgreement />{/if}
    </svelte:fragment>
  </Form>
{/if}
