<script lang="ts">
  import type { MailAccountCard } from '@servone/mail'
  import { disconnectMailbox } from '../api'
  import { mailErrorKey } from '../lib/errors'
  import { text } from '../plugin'
  import { providerLabel } from '../state'
  import * as Dialog from '../../lib/components/ui/dialog'
  import * as RadioGroup from '../../lib/components/ui/radio-group'
  import { Button } from '../../lib/components/ui/button'
  import { Label } from '../../lib/components/ui/label'

  export let account: MailAccountCard
  export let open: boolean = false
  export let onDisconnected: (() => void) | undefined = undefined

  const KEEP = 'keep'
  const DELETE = 'delete'

  let syncedMailChoice = KEEP
  let isDisconnecting = false
  let errorMessage = ''

  async function confirm (): Promise<void> {
    isDisconnecting = true
    errorMessage = ''
    try {
      await disconnectMailbox(syncedMailChoice === DELETE)
      open = false
      onDisconnected?.()
    } catch (error) {
      if (!(error instanceof Error)) throw error
      errorMessage = text(mailErrorKey(error))
    } finally {
      isDisconnecting = false
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{text('Disconnect')}</Dialog.Title>
    </Dialog.Header>
    <p>{text('DisconnectConfirm', { email: account.mailEmail })}</p>
    <p class="disconnect-popup__note">{text('DisconnectProviderSafe', { provider: providerLabel(account) })}</p>
    <fieldset class="disconnect-popup__choice">
      <legend class="disconnect-popup__legend">{text('DisconnectChoice')}</legend>
      <RadioGroup.Root bind:value={syncedMailChoice}>
        <div class="disconnect-popup__option">
          <RadioGroup.Item id="disconnect-keep" value={KEEP} />
          <Label for="disconnect-keep">{text('DisconnectKeep')}</Label>
        </div>
        <div class="disconnect-popup__option">
          <RadioGroup.Item id="disconnect-delete" value={DELETE} />
          <Label for="disconnect-delete">{text('DisconnectDelete')}</Label>
        </div>
      </RadioGroup.Root>
    </fieldset>
    {#if errorMessage !== ''}
      <p role="alert" class="disconnect-popup__error">{errorMessage}</p>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => { open = false }} disabled={isDisconnecting}>{text('Cancel')}</Button>
      <Button variant="destructive" onclick={confirm} disabled={isDisconnecting}>{text('Disconnect')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .disconnect-popup__note {
    color: var(--muted-foreground);
    font-size: 13px;
  }
  .disconnect-popup__choice {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .disconnect-popup__legend {
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 500;
  }
  .disconnect-popup__option {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .disconnect-popup__error {
    color: var(--theme-error-color);
    font-size: 13px;
  }
</style>
