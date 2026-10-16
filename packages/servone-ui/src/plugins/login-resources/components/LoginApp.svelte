<script lang="ts">
  import { getMetadata, setMetadata } from '@hcengineering/platform'
  import presentation, { isAdminUser } from '@hcengineering/presentation'
  import {
    type Location,
    Popup,
    fetchMetadataLocalStorage,
    getCurrentLocation,
    location,
    navigate,
    setMetadataLocalStorage
  } from '@hcengineering/ui'
  import workbench from '@hcengineering/workbench'
  import { getContext, onDestroy, onMount } from 'svelte'
  import { type Pages, getAccount, pages } from '..'
  import login from '../plugin'
  import { syncAccountLocale } from './accountLocale'
  import AdminWorkspaces from './AdminWorkspaces.svelte'
  import Auth from './Auth.svelte'
  import AutoJoin from './AutoJoin.svelte'
  import ChangePassword from './ChangePassword.svelte'
  import Confirmation from './Confirmation.svelte'
  import ConfirmationSend from './ConfirmationSend.svelte'
  import CreateWorkspaceForm from './CreateWorkspaceForm.svelte'
  import Join from './Join.svelte'
  import LanguageSwitch from './LanguageSwitch.svelte'
  import LoginForm from './LoginForm.svelte'
  import LoginTfaForm from './LoginTfaForm.svelte'
  import McpAuthorize from './McpAuthorize.svelte'
  import PasswordRequest from './PasswordRequest.svelte'
  import PasswordRestore from './PasswordRestore.svelte'
  import ProvidersOnlyForm from './ProvidersOnlyForm.svelte'
  import SelectWorkspace from './SelectWorkspace.svelte'
  import SignupForm from './SignupForm.svelte'

  export let page: Pages = 'signup'

  const MCP_REQUEST_KEY = 'servone.mcpAuthorize.request'
  const PRE_LOGIN_PAGES: readonly Pages[] = [
    'login',
    'signup',
    'password',
    'recovery',
    'join',
    'autoJoin',
    'confirm',
    'confirmationSend',
    'auth',
    'tfa',
    'mcpAuthorize'
  ]

  const isSignUpDisabled = getMetadata(login.metadata.DisableSignUp) ?? false
  const isLocalLoginHidden = getMetadata(login.metadata.HideLocalLogin) ?? false
  const mailUrl = getMetadata(presentation.metadata.MailUrl)
  const useOneTimeCodes = mailUrl !== undefined && mailUrl !== null && mailUrl !== ''

  const { setLanguage } = getContext<{ setLanguage: (language: string) => void }>('lang')
  const LANGUAGE_SWITCH_PAGES: readonly Pages[] = ['login', 'signup', 'join']

  let hasSyncedLocale = false
  let navigateUrl: string | undefined
  let tfaToken: string | undefined

  function resolveRoute (currentLocation: Location): void {
    const sessionToken = getMetadata(presentation.metadata.Token)

    if (sessionToken !== undefined && sessionToken !== null) {
      const pendingRequest = sessionStorage.getItem(MCP_REQUEST_KEY)
      if (pendingRequest !== null) {
        sessionStorage.removeItem(MCP_REQUEST_KEY)
        navigate({ path: ['login', 'mcpAuthorize'], query: { request: pendingRequest } }, true)
        return
      }
    }

    const hasToken = sessionToken !== undefined && sessionToken !== null
    let pageName = currentLocation.path[1] ?? (hasToken ? 'selectWorkspace' : 'login')
    if (pageName === 'join' && currentLocation.query !== undefined && 'autoJoin' in currentLocation.query) {
      pageName = 'autoJoin'
    }

    const allowedPages: readonly Pages[] = sessionToken === undefined ? PRE_LOGIN_PAGES : pages
    const requestedPage = allowedPages.find((allowedPage) => allowedPage === pageName)
    const hasLastAccount = fetchMetadataLocalStorage(login.metadata.LastAccount) != null
    const fallbackPage: Pages = hasLastAccount || isSignUpDisabled ? 'login' : 'signup'
    let nextPage: Pages = requestedPage ?? fallbackPage

    if (nextPage === 'createWorkspace' && isSignUpDisabled && !isAdminUser()) {
      nextPage = 'selectWorkspace'
    }

    page = nextPage
    if (hasToken && !hasSyncedLocale) {
      hasSyncedLocale = true
      void syncAccountLocale(setLanguage)
    }
    navigateUrl = currentLocation.query?.navigateUrl ?? undefined
    tfaToken = currentLocation.query?.token ?? undefined
  }

  async function restoreSession (): Promise<void> {
    if (page === 'auth' || page === 'autoJoin') return
    const sessionToken = getMetadata(presentation.metadata.Token)
    if (sessionToken !== undefined && sessionToken !== null) return
    if (fetchMetadataLocalStorage(login.metadata.LastAccount) == null) return

    const restoredInfo = await getAccount(false).catch(() => null)
    if (restoredInfo == null) return
    setMetadata(presentation.metadata.Token, restoredInfo.token)
    setMetadataLocalStorage(login.metadata.LoginAccount, restoredInfo.account)
    resolveRoute(getCurrentLocation())
  }

  $: columnWidthClass = page === 'selectWorkspace' ? 'max-w-md' : page === 'createWorkspace' ? 'max-w-xl' : 'max-w-xs'

  const unsubscribeLocation = location.subscribe(resolveRoute)
  onDestroy(unsubscribeLocation)

  onMount(() => {
    void restoreSession()
  })
</script>

{#if page === 'admin'}
  <AdminWorkspaces />
{:else}
  <div class="servone-login h-full w-full overflow-y-auto bg-background text-foreground">
    <div class="relative flex min-h-full flex-col gap-4 p-6 md:p-10">
      {#if LANGUAGE_SWITCH_PAGES.includes(page)}
        <div class="absolute right-6 top-6 md:right-10 md:top-10"><LanguageSwitch /></div>
      {/if}
      <div class="flex items-center justify-center gap-2 font-medium">
        <img src="/huly/icon-mark.png" alt="" class="h-5 w-auto" />
        {getMetadata(workbench.metadata.PlatformTitle)}
      </div>
      <div class="flex flex-1 justify-center pt-[12vh]">
        <div class="flex w-full flex-col gap-6 {columnWidthClass}">
          {#if page === 'login'}
            {#if isLocalLoginHidden}
              <ProvidersOnlyForm />
            {:else}
              <LoginForm {navigateUrl} signUpDisabled={isSignUpDisabled} useOTP={useOneTimeCodes} />
            {/if}
          {:else if page === 'signup'}
            <SignupForm
              {navigateUrl}
              signUpDisabled={isSignUpDisabled}
              localLoginHidden={isLocalLoginHidden}
              useOTP={useOneTimeCodes}
            />
          {:else if page === 'createWorkspace'}
            <CreateWorkspaceForm />
          {:else if page === 'password'}
            <PasswordRequest signUpDisabled={isSignUpDisabled} />
          {:else if page === 'recovery'}
            <PasswordRestore />
          {:else if page === 'selectWorkspace'}
            <SelectWorkspace {navigateUrl} />
          {:else if page === 'join'}
            <Join />
          {:else if page === 'autoJoin'}
            <AutoJoin />
          {:else if page === 'confirm'}
            <Confirmation />
          {:else if page === 'confirmationSend'}
            <ConfirmationSend />
          {:else if page === 'auth'}
            <Auth />
          {:else if page === 'changePassword'}
            <ChangePassword />
          {:else if page === 'tfa'}
            <LoginTfaForm
              {navigateUrl}
              token={tfaToken}
              on:back={() => {
                page = 'login'
              }}
            />
          {:else if page === 'mcpAuthorize'}
            <McpAuthorize />
          {/if}
        </div>
      </div>
    </div>
    <Popup />
  </div>
{/if}
