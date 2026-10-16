<script lang="ts">
  import type { ConfigSnapshot, RecordTypeInfo } from '@servone/config'
  import { Button } from '../../../../../lib/components/ui/button'
  import { Input } from '../../../../../lib/components/ui/input'
  import { Label } from '../../../../../lib/components/ui/label'
  import type { StudioContext } from '../../extensions'
  import { text } from '../../strings'
  import { connectedType, connectedTypeIssues } from '../connect'
  import { refusalsOf } from '../outcome'
  import PanelShell from './PanelShell.svelte'

  export let studio: StudioContext
  export let snapshot: ConfigSnapshot
  export let source: RecordTypeInfo
  export let onClose: () => void
  export let onSaved: (typeKey: string) => void

  let name = ''
  let isTouched = false
  let isSaving = false
  let refusals: string[] = []

  $: issues = connectedTypeIssues(snapshot, name)

  async function save (): Promise<void> {
    isTouched = true
    if (isSaving || issues.length > 0) return
    isSaving = true
    try {
      const created = connectedType(snapshot, source, name)
      const outcome = await studio.save(created.ops)
      refusals = refusalsOf(outcome)
      if (outcome.kind === 'applied') onSaved(created.typeKey)
      if (outcome.kind === 'applied' || outcome.kind === 'pending') onClose()
    } finally {
      isSaving = false
    }
  }
</script>

<PanelShell kicker={text('GraphKickerLinks', { name: source.name })} title={text('GraphNewForm')} {onClose}>
  <div class="grid gap-1.5">
    <Label for="graph-connected-name">{text('GraphFormName')}</Label>
    <Input
      id="graph-connected-name"
      data-id="graph-connected-name"
      bind:value={name}
      placeholder={text('GraphFormNamePlaceholder')}
      autocomplete="off"
      oninput={() => {
        isTouched = true
      }}
    />
  </div>
  <p class="m-0 text-sm text-muted-foreground">{text('GraphConnectedFrom', { name: source.name })}</p>
  <svelte:fragment slot="footer">
    {#if isTouched && issues.length > 0}
      <ul class="m-0 grid list-none gap-1 p-0 text-xs text-destructive" data-id="graph-panel-issues">
        {#each issues as issue (issue)}<li>{issue}</li>{/each}
      </ul>
    {/if}
    {#if refusals.length > 0}
      <ul class="m-0 grid list-none gap-1 p-0 text-xs text-destructive" data-id="graph-panel-refusal">
        {#each refusals as reason (reason)}<li>{reason}</li>{/each}
      </ul>
    {/if}
    <div class="flex justify-end gap-2">
      <Button variant="outline" size="sm" onclick={onClose}>{text('Cancel')}</Button>
      <Button
        size="sm"
        data-id="graph-connected-save"
        disabled={isSaving}
        onclick={() => {
          void save()
        }}>{text('GraphCreateConnected')}</Button
      >
    </div>
  </svelte:fragment>
</PanelShell>
