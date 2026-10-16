<script lang="ts">
  import type { ConfigSnapshot } from '@servone/config'
  import { BookOpen, FilePlus, Sparkles } from '@lucide/svelte'
  import { Button } from '../../../../../lib/components/ui/button'
  import { endsWithApproval } from '../../automation'
  import AccessTab from '../../components/AccessTab.svelte'
  import CreateTypeDialog from '../../components/CreateTypeDialog.svelte'
  import LinkDialog from '../../components/LinkDialog.svelte'
  import RuleEditor from '../../components/RuleEditor.svelte'
  import type { StudioContext } from '../../extensions'
  import { removeLinkOp } from '../../links'
  import { text } from '../../strings'
  import { typeNodeId } from '../model'
  import { refusalsOf } from '../outcome'
  import type { GraphPanel } from '../panel'
  import { questionNodeId } from '../question'
  import ApprovalPanel from './ApprovalPanel.svelte'
  import ConnectedTypePanel from './ConnectedTypePanel.svelte'
  import PanelShell from './PanelShell.svelte'
  import QuestionPanel from './QuestionPanel.svelte'

  export let studio: StudioContext
  export let snapshot: ConfigSnapshot
  export let panel: GraphPanel
  export let onClose: () => void
  export let onAdded: (nodeId: string) => void
  export let onOpenSide: (side: 'packs' | 'assistant') => void

  let isBlankOpen = false
  let isRemoving = false
  let refusals: string[] = []

  async function removeLink (): Promise<void> {
    if (panel.kind !== 'link' || isRemoving) return
    isRemoving = true
    try {
      const outcome = await studio.save([removeLinkOp(panel.row)])
      refusals = refusalsOf(outcome)
      if (outcome.kind === 'applied') onClose()
    } finally {
      isRemoving = false
    }
  }
</script>

{#if panel.kind === 'field'}
  {@const owner = panel.owner}
  {@const typeKey = panel.type.key}
  <QuestionPanel
    {studio}
    {snapshot}
    type={panel.type}
    {owner}
    ownerName={panel.ownerName}
    field={panel.field}
    siblings={panel.siblings}
    {onClose}
    onSaved={(fieldKey) => {
      onAdded(questionNodeId(typeKey, owner, fieldKey))
    }}
  />
{:else if panel.kind === 'rule' && endsWithApproval(panel.draft.actions)}
  <ApprovalPanel {studio} {snapshot} type={panel.type} draft={panel.draft} {onClose} />
{:else if panel.kind === 'rule'}
  <PanelShell kicker={text('GraphKickerProcess', { name: panel.type.name })} title={text(panel.draft.key === undefined ? 'AddRule' : 'EditRule')} {onClose}>
    <RuleEditor {studio} {snapshot} type={panel.type} draft={panel.draft} {onClose} />
  </PanelShell>
{:else if panel.kind === 'newLink'}
  <LinkDialog {studio} {snapshot} type={panel.type} targetKey={panel.targetKey} {onClose} />
{:else if panel.kind === 'link'}
  <PanelShell kicker={text('GraphKickerLinks', { name: panel.type.name })} title={panel.row.fieldName} {onClose}>
    <p class="m-0 text-sm">{text(panel.row.isMany ? 'GraphLinkMany' : 'GraphLinkOne')} · {panel.row.targetName}</p>
    <svelte:fragment slot="footer">
      {#if refusals.length > 0}
        <ul class="m-0 grid list-none gap-1 p-0 text-xs text-destructive" data-id="graph-panel-refusal">
          {#each refusals as reason (reason)}<li>{reason}</li>{/each}
        </ul>
      {/if}
      {#if !panel.row.isReadOnly}
        <div class="flex justify-start">
          <Button
            variant="outline"
            size="sm"
            data-id="graph-remove-link"
            disabled={isRemoving}
            onclick={() => {
              void removeLink()
            }}>{text('GraphRemoveLink')}</Button
          >
        </div>
      {/if}
    </svelte:fragment>
  </PanelShell>
{:else if panel.kind === 'access'}
  <PanelShell kicker={text('GraphKickerAccess', { name: panel.type.name })} title={text('GraphAccess')} {onClose}>
    <AccessTab {studio} {snapshot} type={panel.type} />
  </PanelShell>
{:else if panel.kind === 'createType'}
  <PanelShell kicker={text('GraphCompany')} title={text('GraphAddType')} {onClose}>
    <p class="m-0 text-sm text-muted-foreground">{text('GraphAddTypeHelp')}</p>
    <div class="grid gap-2">
      <Button
        variant="outline"
        class="justify-start"
        data-id="graph-add-from-pack"
        onclick={() => {
          onOpenSide('packs')
        }}><BookOpen size={16} />{text('GraphFromPack')}</Button
      >
      <Button
        variant="outline"
        class="justify-start"
        data-id="graph-add-with-assistant"
        onclick={() => {
          onOpenSide('assistant')
        }}><Sparkles size={16} />{text('GraphAskAssistant')}</Button
      >
      <Button
        variant="outline"
        class="justify-start"
        data-id="graph-add-blank"
        onclick={() => {
          isBlankOpen = true
        }}><FilePlus size={16} />{text('GraphBlank')}</Button
      >
    </div>
  </PanelShell>
{:else if panel.kind === 'newConnectedType'}
  <ConnectedTypePanel
    {studio}
    {snapshot}
    source={panel.type}
    {onClose}
    onSaved={(typeKey) => {
      onAdded(typeNodeId(typeKey))
    }}
  />
{/if}

{#if isBlankOpen}
  <CreateTypeDialog
    {snapshot}
    {studio}
    onClose={() => {
      isBlankOpen = false
      onClose()
    }}
  />
{/if}
