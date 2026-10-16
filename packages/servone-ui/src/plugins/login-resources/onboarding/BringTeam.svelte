<script lang="ts">
  import { AccountRole } from '@hcengineering/core'
  import login from '@hcengineering/login'
  import { getResource, type IntlString } from '@hcengineering/platform'
  import { copyTextToClipboard, getClient } from '@hcengineering/presentation'
  import setting from '@hcengineering/setting'
  import { resolveInviteSettings } from '@hcengineering/setting-resources'
  import { Label } from '@hcengineering/ui'
  import { ArrowRight, Check, CircleAlert, CircleCheck, Link, Loader2 } from '@lucide/svelte'
  import { onDestroy, onMount } from 'svelte'
  import { expoOut } from 'svelte/easing'
  import { fly, slide } from 'svelte/transition'
  import { Button } from '../../../lib/components/ui/button'
  import { Textarea } from '../../../lib/components/ui/textarea'
  import { intl } from '../../../lib/intl'
  import { parseEmails } from '../../../onboarding/bring-team/emails'
  import { recordInvites } from '../../../onboarding/bring-team/record-invites'

  export let onFinish: (next: 'continue' | 'import') => void

  type InviteState = 'sent' | 'failed' | 'invalid'
  interface InviteRow {
    email: string
    state: InviteState
  }

  const SETUP_CALL_HREF = 'mailto:support@servone.app?subject=Servone%20setup%20call'
  const LINK_COPIED_MS = 2500
  const STATE_LABELS: Record<InviteState, IntlString> = {
    sent: 'ui:string:ServoneSetupInviteSent' as IntlString,
    failed: 'ui:string:ServoneSetupInviteFailed' as IntlString,
    invalid: 'ui:string:ServoneSetupInviteInvalid' as IntlString
  }
  const emailsPlaceholder = intl('ui:string:ServoneSetupEmailsPlaceholder' as IntlString)
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const motion = (ms: number): number => (isReducedMotion ? 0 : ms)

  let dialog: HTMLDialogElement
  let emailText = ''
  let rows: InviteRow[] = []
  let isSending = false
  let isCopying = false
  let isLinkCopied = false
  let isLinkFailed = false
  let isEmailsTouched = false
  let linkCopiedTimer: ReturnType<typeof setTimeout> | undefined

  $: parsed = parseEmails(emailText)
  $: hasPending = parsed.valid.length > 0 || parsed.invalid.length > 0
  $: canSend = !isSending && hasPending
  $: hasSent = rows.some((row) => row.state === 'sent')
  $: hasTypedInvalid = isEmailsTouched && rows.length === 0 && parsed.invalid.length > 0

  onMount(() => dialog.showModal())
  onDestroy(() => clearTimeout(linkCopiedTimer))

  async function sendInvites (): Promise<void> {
    if (!canSend) return
    isSending = true
    try {
      const sendInvite = await getResource(login.function.SendInvite)
      const outcomes = await Promise.allSettled(parsed.valid.map(async (email) => await sendInvite(email, AccountRole.User)))
      rows = [
        ...parsed.invalid.map((email): InviteRow => ({ email, state: 'invalid' })),
        ...parsed.valid.map((email, index): InviteRow => ({
          email,
          state: outcomes[index].status === 'fulfilled' ? 'sent' : 'failed'
        }))
      ]
      void recordInvites(rows.filter((row) => row.state === 'sent').map((row) => row.email)).catch((error: Error) => {
        console.warn('invite follow-up not recorded', error.message)
      })
      emailText = rows
        .filter((row) => row.state !== 'sent')
        .map((row) => row.email)
        .join(', ')
    } finally {
      isSending = false
    }
  }

  async function copyInviteLink (): Promise<void> {
    isCopying = true
    isLinkFailed = false
    try {
      const inviteSettings = resolveInviteSettings(await getClient().findOne(setting.class.InviteSettings, {}))
      const getInviteLink = await getResource(login.function.GetInviteLink)
      const inviteUrl = await getInviteLink(
        inviteSettings.expirationTime,
        inviteSettings.emailMask,
        inviteSettings.limit,
        AccountRole.User
      )
      await copyTextToClipboard(inviteUrl)
      isLinkCopied = true
      clearTimeout(linkCopiedTimer)
      linkCopiedTimer = setTimeout(() => {
        isLinkCopied = false
      }, LINK_COPIED_MS)
    } catch {
      isLinkFailed = true
    } finally {
      isCopying = false
    }
  }

  function onCancel (event: Event): void {
    event.preventDefault()
    if (!isSending && !hasPending) onFinish('continue')
  }

  function onEmailsKeydown (event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void sendInvites()
    }
  }

  const label_ServoneSetupTeamTitle = 'ui:string:ServoneSetupTeamTitle' as IntlString
  const label_ServoneSetupTeamHint = 'ui:string:ServoneSetupTeamHint' as IntlString
  const label_ServoneSetupEmailsHint = 'ui:string:ServoneSetupEmailsHint' as IntlString
  const label_ServoneSetupShareInline = 'ui:string:ServoneSetupShareInline' as IntlString
  const label_ServoneSetupInviteByEmail = 'ui:string:ServoneSetupInviteByEmail' as IntlString
  const label_ServoneSetupInviteInvalid = 'ui:string:ServoneSetupInviteInvalid' as IntlString
  const label_ServoneSetupSendInvites = 'ui:string:ServoneSetupSendInvites' as IntlString
  const label_ServoneSetupLinkCopied = 'ui:string:ServoneSetupLinkCopied' as IntlString
  const label_ServoneSetupCopyLink = 'ui:string:ServoneSetupCopyLink' as IntlString
  const label_ServoneSetupLinkFailed = 'ui:string:ServoneSetupLinkFailed' as IntlString
  const label_ServoneSetupImportTitle = 'ui:string:ServoneSetupImportTitle' as IntlString
  const label_ServoneSetupImportAction = 'ui:string:ServoneSetupImportAction' as IntlString
  const label_ServoneSetupBookCall = 'ui:string:ServoneSetupBookCall' as IntlString
  const label_ServoneSetupContinue = 'ui:string:ServoneSetupContinue' as IntlString
  const label_ServoneSetupSkip = 'ui:string:ServoneSetupSkip' as IntlString
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="bring-team-title"
  aria-describedby="bring-team-hint"
  class="m-auto max-h-[calc(100%-2rem)] w-[30rem] max-w-[calc(100%-2rem)] flex-col overflow-y-auto rounded-xl border bg-popover p-0 text-[13px] leading-[1.45] text-popover-foreground shadow-lg backdrop:bg-black/40 open:flex"
  in:fly={{ y: 8, duration: motion(220), easing: expoOut }}
  on:cancel={onCancel}
>
  <div class="flex flex-col gap-5 px-6 pt-6 pb-5">
    <div class="flex flex-col gap-1">
      <h2 id="bring-team-title" class="m-0 text-base font-semibold tracking-[-0.01em]">
        <Label label={label_ServoneSetupTeamTitle} />
      </h2>
      <p id="bring-team-hint" class="m-0 text-muted-foreground text-pretty">
        <Label label={label_ServoneSetupTeamHint} />
      </p>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="bring-team-emails" class="font-medium">
        <Label label={label_ServoneSetupInviteByEmail} />
      </label>
      <Textarea
        id="bring-team-emails"
        bind:value={emailText}
        placeholder={$emailsPlaceholder}
        rows={3}
        disabled={isSending}
        aria-describedby="bring-team-emails-status"
        aria-invalid={hasTypedInvalid}
        class="min-h-[5.25rem] resize-none rounded-md bg-card text-[13px] md:text-[13px]"
        oninput={() => {
          isEmailsTouched = false
        }}
        onblur={() => {
          isEmailsTouched = true
        }}
        onkeydown={onEmailsKeydown}
      />
      <div id="bring-team-emails-status" aria-live="polite">
        {#if rows.length > 0}
          <ul class="m-0 flex list-none flex-col gap-1 p-0 pt-0.5" transition:slide={{ duration: motion(180), easing: expoOut }}>
            {#each rows as row (row.email)}
              <li class="flex min-w-0 items-center gap-2 text-xs">
                {#if row.state === 'sent'}
                  <CircleCheck class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                {:else}
                  <CircleAlert class="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
                {/if}
                <span class="min-w-0 flex-1 truncate">{row.email}</span>
                <span class="shrink-0 {row.state === 'sent' ? 'text-muted-foreground' : 'text-destructive'}">
                  <Label label={STATE_LABELS[row.state]} />
                </span>
              </li>
            {/each}
          </ul>
        {:else if hasTypedInvalid}
          <p class="m-0 flex min-w-0 items-center gap-1.5 text-xs text-destructive">
            <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="min-w-0 truncate">
              <Label label={label_ServoneSetupInviteInvalid} />: {parsed.invalid.join(', ')}
            </span>
          </p>
        {:else}
          <p class="m-0 text-xs text-muted-foreground"><Label label={label_ServoneSetupEmailsHint} /></p>
        {/if}
      </div>
    </div>

    <div class="flex items-center gap-3">
      <p class="m-0 min-w-0 flex-1 text-xs text-muted-foreground text-pretty">
        {#if isLinkFailed}
          <span class="text-destructive" role="alert"><Label label={label_ServoneSetupLinkFailed} /></span>
        {:else}
          <Label label={label_ServoneSetupShareInline} />
        {/if}
      </p>
      <Button data-track="onboarding.bring_team.copy_link" variant="outline" size="sm" disabled={isCopying} onclick={copyInviteLink}>
        {#if isCopying}
          <Loader2 class="animate-spin" />
        {:else if isLinkCopied}
          <Check />
        {:else}
          <Link />
        {/if}
        <Label label={isLinkCopied ? label_ServoneSetupLinkCopied : label_ServoneSetupCopyLink} />
      </Button>
    </div>

    <div class="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <span><Label label={label_ServoneSetupImportTitle} /></span>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline-offset-[3px] outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        on:click={() => onFinish('import')}
      >
        <Label label={label_ServoneSetupImportAction} />
        <ArrowRight class="size-3" aria-hidden="true" />
      </button>
    </div>
  </div>

  <div class="flex items-center gap-2 rounded-b-xl border-t bg-muted/50 px-6 py-3">
    <a
      href={SETUP_CALL_HREF}
      class="mr-auto inline-flex min-h-8 items-center rounded-sm text-xs font-medium text-muted-foreground underline-offset-[3px] outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Label label={label_ServoneSetupBookCall} />
    </a>
    {#if hasSent && !hasPending}
      <Button data-track="onboarding.bring_team.continue" onclick={() => onFinish('continue')}>
        <Label label={label_ServoneSetupContinue} />
      </Button>
    {:else}
      <Button data-track="onboarding.bring_team.skip" variant="ghost" class="text-muted-foreground" disabled={isSending} onclick={() => onFinish('continue')}>
        <Label label={hasSent ? label_ServoneSetupContinue : label_ServoneSetupSkip} />
      </Button>
      <Button data-track="onboarding.bring_team.send" disabled={!canSend} onclick={sendInvites} aria-busy={isSending}>
        {#if isSending}
          <Loader2 class="animate-spin" />
        {/if}
        <Label label={label_ServoneSetupSendInvites} />
        {#if parsed.valid.length > 0}
          <span class="tabular-nums" aria-hidden="true">{parsed.valid.length}</span>
        {/if}
      </Button>
    {/if}
  </div>
</dialog>
