<script lang="ts">
  import { type LoginInfo } from '@hcengineering/account-client'
  import { signupStore } from '@hcengineering/analytics-providers'
  import { type IntlString, Status } from '@hcengineering/platform'
  import { onMount } from 'svelte'
  import { type BottomAction, LoginMethods } from '../index'
  import login from '../plugin'
  import BottomActionComponent from './BottomAction.svelte'
  import LoginOtpForm from './LoginOtpForm.svelte'
  import LoginPasswordForm from './LoginPasswordForm.svelte'

  export let navigateUrl: string | undefined = undefined
  export let signUpDisabled: boolean = false
  export let useOTP: boolean = true
  export let email: string | undefined = undefined
  export let caption: IntlString | undefined = undefined
  export let subtitle: string | undefined = undefined
  export let onLogin: ((loginInfo: LoginInfo | null, status: Status) => void | Promise<void>) | undefined = undefined

  let activeMethod: LoginMethods = useOTP ? LoginMethods.Otp : LoginMethods.Password

  const switchToPasswordAction: BottomAction = {
    i18n: login.string.LoginWithPassword,
    func: () => {
      activeMethod = LoginMethods.Password
    }
  }
  const switchToCodeAction: BottomAction = {
    i18n: login.string.LoginWithCode,
    func: () => {
      activeMethod = LoginMethods.Otp
    }
  }

  $: switchAction = activeMethod === LoginMethods.Otp ? switchToPasswordAction : switchToCodeAction

  function selectMethod (event: CustomEvent<LoginMethods>): void {
    activeMethod = event.detail
  }

  onMount(() => {
    signupStore.setSignUpFlow(false)
  })
</script>

{#if activeMethod === LoginMethods.Otp}
  <LoginOtpForm {navigateUrl} {signUpDisabled} {email} {caption} {subtitle} {onLogin} on:change={selectMethod} />
{:else}
  <LoginPasswordForm {navigateUrl} {signUpDisabled} {email} {caption} {subtitle} {onLogin} on:change={selectMethod} />
{/if}

<div class="flex flex-col items-center gap-2 text-center text-sm">
  <BottomActionComponent action={switchAction} />
</div>
