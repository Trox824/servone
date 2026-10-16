<script lang="ts">
  import type { MailAccountCard } from '@servone/mail'
  import { findPreset, IMAP_PORTS, SMTP_PORTS, type ProviderId } from '@servone/mail'
  import { closePopup } from '@hcengineering/ui'
  import { ChevronDown } from '@lucide/svelte'
  import { connectAt, googleConsentUrl, type ConnectForm, type LoginCheck } from '../api'
  import { formFor, loginErrorKey, visibleTiles, type ConnectPhase } from '../lib/connect'
  import { mailErrorKey } from '../lib/errors'
  import { text } from '../plugin'
  import ProviderTile from './ProviderTile.svelte'
  import { Button } from '../../lib/components/ui/button'
  import { Input } from '../../lib/components/ui/input'
  import { Label } from '../../lib/components/ui/label'
  import { Badge } from '../../lib/components/ui/badge'
  import * as Select from '../../lib/components/ui/select'

  export let account: MailAccountCard | undefined = undefined

  const isPopup = account !== undefined
  const tiles = visibleTiles(account?.mailProvider)

  let selectedProvider: ProviderId | undefined = account?.mailProvider
  let email = account?.mailEmail ?? ''
  let password = ''
  let imapHost = ''
  let imapPort = IMAP_PORTS[1]
  let smtpHost = ''
  let smtpPort = SMTP_PORTS[1]
  let phase: ConnectPhase = { kind: 'idle' }
  let isAppPasswordOpen = false

  $: preset = selectedProvider !== undefined ? findPreset(selectedProvider) : undefined
  $: needsHosts = selectedProvider === 'other'
  $: showsPasswordForm = selectedProvider !== 'gmail' || isAppPasswordOpen
  $: canSubmit =
    email.trim() !== '' &&
    password !== '' &&
    (!needsHosts || (imapHost.trim() !== '' && smtpHost.trim() !== '')) &&
    phase.kind !== 'connecting'

  function selectProvider (id: ProviderId): void {
    if (id === 'outlook') return
    selectedProvider = id
    phase = { kind: 'idle' }
    password = ''
    isAppPasswordOpen = false
  }

  function currentForm (): ConnectForm {
    if (selectedProvider === undefined) throw new Error('no provider selected')
    return formFor(selectedProvider, email.trim(), password, imapHost.trim(), imapPort, smtpHost.trim(), smtpPort)
  }

  function failFromCheck (check: Exclude<LoginCheck, { isOk: true }>): ConnectPhase {
    if (selectedProvider === undefined) throw new Error('no provider selected')
    const key = loginErrorKey(check, selectedProvider)
    const canRepeat = check.reason === 'network' || check.reason === 'tls'
    return canRepeat ? { kind: 'failed', key, retry: () => { void runConnect() } } : { kind: 'failed', key }
  }

  async function runConnect (): Promise<void> {
    phase = { kind: 'connecting' }
    try {
      const connected = await connectAt(account !== undefined ? '/mail/reconnect' : '/mail/connect', currentForm())
      if (connected.isOk && 'account' in connected) {
        password = ''
        if (isPopup) closePopup()
        return
      }
      phase = connected.isOk ? { kind: 'idle' } : failFromCheck(connected)
    } catch (error) {
      if (!(error instanceof Error)) throw error
      phase = { kind: 'failed', key: mailErrorKey(error), retry: () => { void runConnect() } }
    }
  }

  async function signInGoogle (): Promise<void> {
    phase = { kind: 'connecting' }
    try {
      const url = await googleConsentUrl()
      window.location.assign(url)
    } catch (error) {
      if (!(error instanceof Error)) throw error
      phase = { kind: 'failed', key: mailErrorKey(error), retry: () => { void signInGoogle() } }
    }
  }

  function submit (event: SubmitEvent): void {
    event.preventDefault()
    if (canSubmit) void runConnect()
  }

  function cancel (): void {
    if (isPopup) closePopup()
  }
</script>

<div class="connect-screen" class:connect-screen--popup={isPopup}>
  <h1 class="connect-screen__title">{text('ConnectTitle')}</h1>
  <p class="connect-screen__body">{text('ConnectBody')}</p>

  <div class="connect-screen__grid">
    {#each tiles as provider (provider)}
      <ProviderTile
        {provider}
        isSelected={selectedProvider === provider}
        isDisabled={provider === 'outlook'}
        onSelect={() => { selectProvider(provider) }}
      />
    {/each}
  </div>

  {#if selectedProvider === 'outlook'}
    <div class="connect-screen__form">
      <Button disabled class="w-full">
        {text('SignInMicrosoft')}
        <Badge variant="secondary">{text('ComingSoon')}</Badge>
      </Button>
    </div>
  {:else if selectedProvider !== undefined}
    <form class="connect-screen__form" onsubmit={submit}>
      {#if selectedProvider === 'gmail'}
        <Button class="w-full" onclick={signInGoogle} disabled={phase.kind === 'connecting'}>
          <!-- Same mark as plugins/login-resources icons/Google.svelte; servone-ui does not depend on that package. -->
          <svg class="connect-screen__google" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
          </svg>
          {text('SignInGoogle')}
        </Button>
        <button
          type="button"
          class="connect-screen__disclosure"
          aria-expanded={isAppPasswordOpen}
          aria-controls="connect-password-fields"
          onclick={() => { isAppPasswordOpen = !isAppPasswordOpen }}
        >
          {text('UseAppPassword')}
          <ChevronDown size={14} class={isAppPasswordOpen ? 'rotate-180' : ''} />
        </button>
      {/if}

      {#if showsPasswordForm}
        <div id="connect-password-fields" class="connect-screen__fields">
          <div class="connect-screen__field">
            <Label for="connect-email">{text('Email')}</Label>
            <Input id="connect-email" type="email" autocomplete="email" placeholder={text('EmailPlaceholder')} bind:value={email} />
          </div>

          <div class="connect-screen__field">
            <Label for="connect-password">{text('AppPassword')}</Label>
            <Input id="connect-password" type="password" autocomplete="off" placeholder={text('AppPasswordPlaceholder')} bind:value={password} />
            <p class="connect-screen__hint">{text('AppPasswordHelp')}</p>
            {#if preset?.appPasswordHelpUrl !== undefined}
              <a class="connect-screen__help" href={preset.appPasswordHelpUrl} target="_blank" rel="noopener noreferrer">{text('HowAppPassword')}</a>
            {/if}
          </div>

          {#if needsHosts}
            <div class="connect-screen__field">
              <Label for="connect-imap-host">{text('ImapHost')}</Label>
              <Input id="connect-imap-host" type="text" placeholder="imap.example.com" bind:value={imapHost} />
            </div>
            <div class="connect-screen__field">
              <Label for="connect-imap-port">{text('ImapPort')}</Label>
              <Select.Root type="single" value={String(imapPort)} onValueChange={(picked) => { imapPort = Number(picked) }}>
                <Select.Trigger id="connect-imap-port">{imapPort}</Select.Trigger>
                <Select.Content>
                  {#each IMAP_PORTS as port (port)}
                    <Select.Item value={String(port)} label={String(port)} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
            <div class="connect-screen__field">
              <Label for="connect-smtp-host">{text('SmtpHost')}</Label>
              <Input id="connect-smtp-host" type="text" placeholder="smtp.example.com" bind:value={smtpHost} />
            </div>
            <div class="connect-screen__field">
              <Label for="connect-smtp-port">{text('SmtpPort')}</Label>
              <Select.Root type="single" value={String(smtpPort)} onValueChange={(picked) => { smtpPort = Number(picked) }}>
                <Select.Trigger id="connect-smtp-port">{smtpPort}</Select.Trigger>
                <Select.Content>
                  {#each SMTP_PORTS as port (port)}
                    <Select.Item value={String(port)} label={String(port)} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}
        </div>
      {/if}

      {#if phase.kind === 'failed'}
        <div role="alert" class="connect-screen__error">
          <span>{text(phase.key)}</span>
          {#if phase.retry !== undefined}
            <Button type="button" size="sm" variant="outline" onclick={phase.retry}>{text('Retry')}</Button>
          {/if}
        </div>
      {/if}

      {#if showsPasswordForm || isPopup}
        <div class="connect-screen__actions">
          {#if isPopup}
            <Button type="button" variant="outline" onclick={cancel}>{text('Cancel')}</Button>
          {/if}
          {#if showsPasswordForm}
            <Button data-track="mail.connect.submit" type="submit" disabled={!canSubmit}>
              {phase.kind === 'connecting' ? text('Connecting') : text('Connect')}
            </Button>
          {/if}
        </div>
      {/if}
    </form>
  {/if}
</div>

<style>
  .connect-screen {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    align-items: center;
    /* `safe` keeps the top reachable when the form is taller than the pane. */
    justify-content: safe center;
    gap: 24px;
    padding: 48px 24px;
    overflow: auto;
    text-align: center;
  }
  /* Fits three 140px tiles plus two 12px gaps inside the 24px padding. */
  .connect-screen--popup {
    padding: 24px;
    width: 492px;
    max-width: calc(100vw - 32px);
  }
  .connect-screen__title {
    margin: 0;
    color: var(--theme-caption-color);
    font-size: 20px;
    font-weight: 700;
    line-height: 28px;
  }
  .connect-screen__body {
    margin: 0;
    max-width: 420px;
    color: var(--theme-halfcontent-color);
    font-size: 14px;
    font-weight: 400;
  }
  /* Three per row; a short last row centres instead of hugging the left edge. */
  .connect-screen__grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    width: 100%;
    max-width: 520px;
  }
  .connect-screen__grid > :global(*) {
    flex: 0 0 calc((100% - 24px) / 3);
  }
  .connect-screen__form {
    display: flex;
    width: 100%;
    max-width: 360px;
    flex-direction: column;
    gap: 12px;
    text-align: left;
  }
  .connect-screen__google {
    width: 16px;
    height: 16px;
  }
  .connect-screen__disclosure {
    display: inline-flex;
    align-self: center;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 6px;
    color: var(--muted-foreground);
    font-size: 13px;
    cursor: pointer;
  }
  .connect-screen__disclosure:hover {
    color: var(--theme-content-color);
  }
  .connect-screen__disclosure:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .connect-screen__fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .connect-screen__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .connect-screen__hint {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 13px;
  }
  .connect-screen__help {
    align-self: flex-start;
    color: var(--primary);
    font-size: 13px;
  }
  .connect-screen__error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin: 0;
    color: var(--theme-error-color);
    font-size: 13px;
  }
  .connect-screen__actions {
    display: flex;
    margin-top: 8px;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
