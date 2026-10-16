<script lang="ts">
  import { type ProviderInfo } from '@hcengineering/account-client'
  import { Analytics } from '@hcengineering/analytics'
  import { concatLink } from '@hcengineering/core'
  import { getMetadata, type IntlString } from '@hcengineering/platform'
  import { type AnySvelteComponent, getCurrentLocation, Label } from '@hcengineering/ui'
  import { onMount } from 'svelte'
  import { Button, buttonVariants } from '../../../lib/components/ui/button'
  import { cn } from '../../../lib/utils'
  import login from '../plugin'
  import { getProviders } from '../utils'
  import LegalAgreement from './LegalAgreement.svelte'
  import { hasStoredConsent, termsAccepted } from './termsConsent'
  import Github from './providers/Github.svelte'
  import Google from './providers/Google.svelte'
  import OpenId from './providers/OpenId.svelte'

  const providerBodies: Record<string, AnySvelteComponent> = {
    google: Google,
    github: Github,
    openid: OpenId
  }

  const orLabel = 'login:string:ServoneOr' as IntlString
  const linkClass = cn(buttonVariants({ variant: 'outline' }), 'w-full')
  const accountsUrl = getMetadata(login.metadata.AccountsUrl) ?? ''
  const startLocation = getCurrentLocation()
  const startQuery = startLocation.query
  const startPageName = startLocation.path[1]
  const isSignUp = startPageName === 'signup' || startPageName === 'join'
  const eventPrefix = isSignUp ? 'signup' : 'login'
  const googleConnectsLabel = 'login:string:ServoneGoogleConnects' as IntlString

  const consentLabel = 'ui:string:ServoneLoginGoogleConsent' as IntlString
  const continueLabel = 'ui:string:ServoneLoginContinue' as IntlString

  let providers: ProviderInfo[] = []
  let pendingProvider: { name: string, href: string } | undefined

  function startProvider (event: MouseEvent, providerName: string): void {
    if ($termsAccepted || hasStoredConsent()) {
      Analytics.handleEvent(`${eventPrefix}.${providerName}.started`)
      return
    }
    event.preventDefault()
    pendingProvider = { name: providerName, href: (event.currentTarget as HTMLAnchorElement).href }
  }

  function continueWithProvider (): void {
    if (pendingProvider === undefined) return
    Analytics.handleEvent(`${eventPrefix}.${pendingProvider.name}.started`)
    window.location.assign(pendingProvider.href)
  }

  function buildProviderHref (providerName: string): string {
    let href = concatLink(accountsUrl, `/auth/${providerName}`)
    const inviteId = startQuery?.inviteId
    if (inviteId === undefined || inviteId === null) return href
    href += `?inviteId=${inviteId}`
    if (startQuery !== undefined && 'autoJoin' in startQuery) href += '&autoJoin'
    const navigateUrl = startQuery?.navigateUrl
    if (navigateUrl !== undefined && navigateUrl !== null) href += `&navigateUrl=${navigateUrl}`
    return href
  }

  onMount(async () => {
    providers = await getProviders()
  })
</script>

{#if providers.length > 0}
  <div class="flex flex-col gap-3">
    <div
      class="relative text-center text-xs uppercase text-muted-foreground after:absolute after:inset-0 after:top-1/2 after:border-t after:border-border"
    >
      <span class="relative z-10 bg-card px-2"><Label label={orLabel} /></span>
    </div>
    {#each providers as provider (provider.name)}
      <a
        href={buildProviderHref(provider.name)}
        class={linkClass}
        on:click={(event) => {
          startProvider(event, provider.name)
        }}
      >
        <svelte:component this={providerBodies[provider.name]} displayName={provider.displayName} />
      </a>
      {#if isSignUp && provider.name === 'google'}
        <p class="text-center text-xs text-muted-foreground"><Label label={googleConnectsLabel} /></p>
      {/if}
    {/each}
    {#if pendingProvider !== undefined}
      <div class="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
        <p class="col-span-2 text-sm text-muted-foreground"><Label label={consentLabel} /></p>
        <LegalAgreement />
        <Button type="button" class="col-span-2 w-full" disabled={!$termsAccepted} onclick={continueWithProvider}>
          <Label label={continueLabel} />
        </Button>
      </div>
    {/if}
  </div>
{/if}
