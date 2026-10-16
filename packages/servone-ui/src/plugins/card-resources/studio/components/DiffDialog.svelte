<script lang="ts">
  import * as AlertDialog from '../../../../lib/components/ui/alert-dialog'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Input } from '../../../../lib/components/ui/input'
  import { Label } from '../../../../lib/components/ui/label'
  import { diffRows, isPhraseMatched, riskLabel, riskTone, type ConfirmRequest } from '../diff'
  import { text } from '../strings'

  export let request: ConfirmRequest | undefined
  export let onDone: () => void

  let typed = ''

  $: rows = request !== undefined ? diffRows(request.change.diff) : []
  $: canConfirm = request !== undefined && isPhraseMatched(typed, request.phrase)

  function finish (isConfirmed: boolean): void {
    if (request === undefined) return
    request.resolve(isConfirmed)
    typed = ''
    onDone()
  }
</script>

<AlertDialog.Root
  open={request !== undefined}
  onOpenChange={(isOpen) => {
    if (!isOpen) finish(false)
  }}
>
  {#if request !== undefined}
    <AlertDialog.Content data-id="studio-diff-dialog" class="sm:max-w-lg">
      <AlertDialog.Header>
        <AlertDialog.Title>{text('DiffTitle')}</AlertDialog.Title>
        <AlertDialog.Description>{text('DiffIntro')}</AlertDialog.Description>
      </AlertDialog.Header>
      <ul class="m-0 grid max-h-72 list-none overflow-y-auto border-y border-border p-0">
        {#each rows as row}
          <li class="flex items-start justify-between gap-3 border-t border-border py-2 text-sm first:border-t-0">
            <span class="min-w-0 break-words">{row.text}</span>
            <span class="flex shrink-0 gap-1 pt-px">
              {#if row.affectedText !== undefined}
                <Badge variant="destructive">{row.affectedText}</Badge>
              {/if}
              <Badge variant={riskTone(row.risk)}>{riskLabel(row.risk)}</Badge>
            </span>
          </li>
        {/each}
      </ul>
      {#if request.phrase !== undefined}
        <div class="grid gap-1.5">
          <Label for="studio-diff-phrase">{text('TypePhrase', { name: request.phrase })}</Label>
          <Input id="studio-diff-phrase" data-id="studio-diff-phrase" bind:value={typed} autocomplete="off" />
        </div>
      {/if}
      <AlertDialog.Footer>
        <AlertDialog.Cancel
          data-id="studio-diff-cancel"
          onclick={() => {
            finish(false)
          }}>{text('Cancel')}</AlertDialog.Cancel
        >
        <AlertDialog.Action
          data-id="studio-diff-confirm"
          variant="destructive"
          disabled={!canConfirm}
          onclick={() => {
            finish(true)
          }}>{text('Confirm')}</AlertDialog.Action
        >
      </AlertDialog.Footer>
    </AlertDialog.Content>
  {/if}
</AlertDialog.Root>
