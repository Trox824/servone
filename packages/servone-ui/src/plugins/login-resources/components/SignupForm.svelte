<script lang="ts">
  import { type IntlString, OK, Severity, Status } from '@hcengineering/platform'
  import { logIn } from '@hcengineering/workbench'
  import { signupStore } from '@hcengineering/analytics-providers'
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import login from '../plugin'
  import { getPasswordValidationRules } from '../validations'
  import { goTo } from '../utils'
  import { OtpLoginSteps, signUp, signUpOtp, type BottomAction } from '../index'
  import type { Field } from '../types'
  import Form from './Form.svelte'
  import OtpForm from './OtpForm.svelte'
  import BottomActionComponent from './BottomAction.svelte'
  import LegalAgreement from './LegalAgreement.svelte'
  import { termsAccepted } from './termsConsent'

  export let signUpDisabled: boolean = false
  export let localLoginHidden: boolean = false
  export let navigateUrl: string | undefined = undefined
  export let useOTP: boolean = true

  if (signUpDisabled || localLoginHidden) goTo('login')

  onMount(() => {
    signupStore.setSignUpFlow(true)
  })

  let isPasswordMode: boolean = !useOTP
  let status: Status = OK
  let currentStep: OtpLoginSteps = OtpLoginSteps.Email
  let otpRetryOn: number = 0
  let formInstance: Form | undefined

  const enteredValues: Record<string, string> = {
    first: '',
    last: '',
    username: '',
    password: '',
    password2: ''
  }

  const termsRequired = 'ui:string:ServoneLoginTermsRequired' as IntlString
  const termsRule = { rule: () => get(termsAccepted), notMatch: false, ruleDescr: termsRequired }

  function buildFields (withPassword: boolean): Field[] {
    const baseFields: Field[] = [
      { id: 'given-name', name: 'first', i18n: login.string.FirstName, short: true },
      { id: 'family-name', name: 'last', i18n: login.string.LastName, short: true },
      { id: 'email', name: 'username', i18n: login.string.Email, rules: withPassword ? [] : [termsRule] }
    ]
    if (!withPassword) return baseFields
    const passwordFields: Field[] = [
      {
        id: 'new-password',
        name: 'password',
        i18n: login.string.Password,
        password: true,
        rules: getPasswordValidationRules()
      },
      {
        id: 'new-password',
        name: 'password2',
        i18n: login.string.PasswordRepeat,
        password: true,
        rules: [termsRule]
      }
    ]
    return [...baseFields, ...passwordFields]
  }

  $: formFields = buildFields(isPasswordMode)
  $: if ($termsAccepted !== undefined) formInstance?.invalidate()

  async function submitViaOtp (): Promise<void> {
    status = new Status(Severity.INFO, login.status.ConnectingToServer, {})
    const [otpStatus, otpInfo] = await signUpOtp(enteredValues.username, enteredValues.first, enteredValues.last)
    status = otpStatus
    if (otpInfo?.sent === true && otpStatus === OK) {
      currentStep = OtpLoginSteps.Otp
      otpRetryOn = otpInfo.retryOn
    }
  }

  async function submitViaPassword (): Promise<void> {
    const [signUpStatus, loginInfo] = await signUp(
      enteredValues.username,
      enteredValues.password,
      enteredValues.first,
      enteredValues.last
    )
    status = signUpStatus
    if (loginInfo === null) return
    if (loginInfo.token != null) {
      await logIn(loginInfo)
    }
    goTo('confirmationSend')
  }

  const submitAction = {
    i18n: login.string.SignUp,
    func: async () => {
      if (useOTP) await submitViaOtp()
      else await submitViaPassword()
    }
  }

  function togglePasswordMode (): void {
    isPasswordMode = !isPasswordMode
    currentStep = OtpLoginSteps.Email
    setTimeout(() => {
      formInstance?.invalidate()
    }, 0)
  }

  $: passwordToggleAction = {
    i18n: isPasswordMode ? login.string.SetPasswordLater : login.string.SetPasswordNow,
    func: togglePasswordMode
  } satisfies BottomAction
</script>

{#if currentStep === OtpLoginSteps.Email}
  <Form
    bind:this={formInstance}
    caption={login.string.SignUp}
    {status}
    fields={formFields}
    object={enteredValues}
    action={submitAction}
    withProviders={true}
  >
    <svelte:fragment slot="extra-fields"><LegalAgreement /></svelte:fragment>
  </Form>
{:else if currentStep === OtpLoginSteps.Otp && enteredValues.username !== ''}
  <OtpForm
    email={enteredValues.username}
    {signUpDisabled}
    {navigateUrl}
    loginState="signup"
    password={enteredValues.password}
    retryOn={otpRetryOn}
    on:step={(event) => {
      currentStep = event.detail
    }}
  />
{/if}

{#if useOTP}
  <div class="flex flex-col items-center gap-2 text-center text-sm">
    <BottomActionComponent action={passwordToggleAction} />
  </div>
{/if}
