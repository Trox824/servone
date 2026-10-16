<!-- Shown once after a webhook is added: the service never returns the secret again. -->
<script lang="ts">
  import { copyTextToClipboard } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import { Check, Copy } from '@lucide/svelte'
  import { Button } from '../../../lib/components/ui/button'
  import * as Dialog from '../../../lib/components/ui/dialog'
  import { str } from '../sprints/plugin'

  export let secret: string
  export let onClose: () => void

  const CHECK_SNIPPET = `const { createHmac, timingSafeEqual } = require('crypto')
function isValid (secret, headers, rawBody) {
  const ts = Number(headers['servone-timestamp'])
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false
  const expected = 'v1=' + createHmac('sha256', secret).update(\`\${ts}.\${rawBody}\`).digest('hex')
  const given = String(headers['servone-signature'])
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}`

  let isCopied = false
  let isWarned = false

  async function copy (): Promise<void> {
    await copyTextToClipboard(secret)
    isCopied = true
    isWarned = false
  }

  function done (): void {
    if (isCopied || isWarned) onClose()
    else isWarned = true
  }
</script>

<!-- Only Done closes it, so the secret is not lost to a stray click or Escape. -->
<Dialog.Root open>
  <Dialog.Content
    class="sm:max-w-xl"
    showCloseButton={false}
    interactOutsideBehavior="ignore"
    escapeKeydownBehavior="ignore"
    data-id="tracker-webhook-secret"
  >
    <Dialog.Header>
      <Dialog.Title><Label label={str.SigningSecret} /></Dialog.Title>
      <Dialog.Description><Label label={str.SigningSecretHint} /></Dialog.Description>
    </Dialog.Header>
    <div class="flex items-center gap-2">
      <code class="min-w-0 flex-1 rounded-md border bg-muted px-2 py-1.5 font-mono text-xs break-all select-all">{secret}</code>
      <Button variant="outline" size="sm" onclick={() => { void copy() }}>
        {#if isCopied}<Check />{:else}<Copy />{/if}
        <Label label={isCopied ? str.SecretCopied : str.CopySecret} />
      </Button>
    </div>
    <div class="grid gap-1.5">
      <p class="m-0 text-sm"><Label label={str.SigningSecretCheck} /></p>
      <pre class="m-0 max-h-56 overflow-auto rounded-md border bg-muted p-2 font-mono text-xs leading-relaxed">{CHECK_SNIPPET}</pre>
    </div>
    {#if isWarned}
      <p class="m-0 text-sm text-destructive"><Label label={str.SecretNotCopied} /></p>
    {/if}
    <Dialog.Footer>
      <Button variant={isWarned ? 'destructive' : 'default'} onclick={done}>
        <Label label={isWarned ? str.CloseAnyway : str.SecretDone} />
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
