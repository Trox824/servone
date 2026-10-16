<script lang="ts">
  import { slugify, type ConfigSnapshot, type FieldInfo, type RecordTypeInfo } from '@servone/config'
  import { Eye } from '@lucide/svelte'
  import { Button } from '../../../../../lib/components/ui/button'
  import { Input } from '../../../../../lib/components/ui/input'
  import { Label } from '../../../../../lib/components/ui/label'
  import { Switch } from '../../../../../lib/components/ui/switch'
  import KindIcon from '../../components/KindIcon.svelte'
  import OptionsEditor from '../../components/OptionsEditor.svelte'
  import type { StudioContext } from '../../extensions'
  import { defaultKind, draftIssues, draftOf, fieldOps, hasOptions, newDraft, removeFieldOp, takenFieldKeys, type FieldDraft } from '../../fields'
  import { text } from '../../strings'
  import { uniqueKey } from '../../type-list'
  import { refusalsOf } from '../outcome'
  import { questionKindLabel } from '../phrases'
  import { kindHint, previewRows, QUESTION_KINDS, type QuestionKind } from '../question'
  import PanelShell from './PanelShell.svelte'

  export let studio: StudioContext
  export let snapshot: ConfigSnapshot
  export let type: RecordTypeInfo
  export let owner: string
  export let ownerName: string
  export let field: FieldInfo | undefined
  export let siblings: FieldInfo[]
  export let onClose: () => void
  export let onSaved: (fieldKey: string) => void

  const isNew = field === undefined

  let draft: FieldDraft = (field !== undefined ? draftOf(field) : undefined) ?? newDraft()
  let isTouched = !isNew
  let isSaving = false
  let refusals: string[] = []

  $: issues = draftIssues(draft, siblings, field)
  $: rows = previewRows(siblings, field, draft)
  $: isRemovable = field !== undefined && !field.isBuiltIn

  function pickKind (kind: QuestionKind): void {
    draft = { ...draft, kind: defaultKind(kind), options: [] }
  }

  async function save (): Promise<void> {
    isTouched = true
    if (isSaving || issues.length > 0) return
    isSaving = true
    try {
      const key = field?.key ?? uniqueKey(slugify(draft.name.trim()), takenFieldKeys(snapshot, type))
      const ops = fieldOps(owner, field, draft, key)
      if (ops.length === 0) {
        onClose()
        return
      }
      const outcome = await studio.save(ops)
      refusals = refusalsOf(outcome)
      if (outcome.kind === 'applied' && isNew) onSaved(key)
      if (outcome.kind === 'applied' || outcome.kind === 'pending') onClose()
    } finally {
      isSaving = false
    }
  }

  async function remove (): Promise<void> {
    if (field === undefined || isSaving) return
    isSaving = true
    try {
      const outcome = await studio.save([removeFieldOp(owner, field)])
      refusals = refusalsOf(outcome)
      if (outcome.kind === 'applied') onClose()
    } finally {
      isSaving = false
    }
  }
</script>

<PanelShell kicker={text('GraphKickerForm', { name: ownerName })} title={text(isNew ? 'QuestionNew' : 'QuestionEdit')} {onClose}>
  <div class="grid gap-1.5">
    <Label for="studio-field-name">{text('QuestionLabel')}</Label>
    <Input
      id="studio-field-name"
      data-id="studio-field-name"
      bind:value={draft.name}
      placeholder={text('QuestionPlaceholder')}
      autocomplete="off"
      oninput={() => {
        isTouched = true
      }}
    />
  </div>
  <div class="grid gap-1.5">
    <span class="text-sm font-medium" id="graph-answer-kind">{text('QuestionAnswerKind')}</span>
    <div class="graph-tiles" role="radiogroup" aria-labelledby="graph-answer-kind">
      {#each QUESTION_KINDS as kind (kind)}
        <button
          type="button"
          role="radio"
          aria-checked={draft.kind.kind === kind}
          class="graph-tile"
          class:is-on={draft.kind.kind === kind}
          disabled={!isNew}
          data-id={`studio-question-kind-${kind}`}
          onclick={() => {
            pickKind(kind)
          }}
        >
          <KindIcon {kind} />
          <span class="graph-tile-name">{questionKindLabel(kind)}</span>
          <span class="graph-tile-hint">{kindHint(kind)}</span>
        </button>
      {/each}
    </div>
    {#if !isNew}<p class="m-0 text-xs text-muted-foreground">{text('QuestionKindFixed')}</p>{/if}
  </div>
  {#if hasOptions(draft.kind)}
    <div class="grid gap-1.5">
      <span class="text-sm font-medium">{text('QuestionOptions')}</span>
      <OptionsEditor
        edits={draft.options}
        isExisting={!isNew}
        onChange={(next) => {
          draft = { ...draft, options: next }
        }}
      />
    </div>
  {/if}
  <label class="graph-toggle">
    <Switch
      data-id="studio-field-required"
      checked={draft.isRequired}
      disabled={field?.isBuiltIn === true}
      onCheckedChange={(isChecked) => {
        draft = { ...draft, isRequired: isChecked }
      }}
    />
    <span class="grid gap-0.5">
      <span class="text-sm font-medium">{text('QuestionRequired')}</span>
      <span class="graph-toggle-help">{text('QuestionRequiredHelp')}</span>
    </span>
  </label>
  <section class="graph-preview" data-id="graph-question-preview">
    <h3 class="graph-preview-cap"><Eye size={14} aria-hidden="true" />{text('QuestionPreview')}</h3>
    <ul class="graph-preview-form">
      {#each rows as row (row.key)}
        <li class="graph-preview-row" class:is-edited={row.isEdited}>
          <span class="graph-preview-name">{row.name}{#if row.isRequired}<span aria-hidden="true"> *</span>{/if}</span>
          <span class="graph-preview-box">{row.kindLabel}</span>
        </li>
      {/each}
    </ul>
  </section>
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
    <div class="flex items-center gap-2">
      <span class="graph-save-hint">{text('QuestionSaveHint')}</span>
      {#if isRemovable}
        <Button
          variant="ghost"
          size="sm"
          data-id="studio-field-remove"
          disabled={isSaving}
          onclick={() => {
            void remove()
          }}>{text('QuestionRemove')}</Button
        >
      {/if}
      <Button variant="outline" size="sm" onclick={onClose}>{text('Cancel')}</Button>
      <Button
        size="sm"
        data-id="studio-field-save"
        disabled={isSaving}
        onclick={() => {
          void save()
        }}>{text(isNew ? 'QuestionAdd' : 'Save')}</Button
      >
    </div>
  </svelte:fragment>
</PanelShell>

<style>
  /* Mockup screen 3: 3x3 left-aligned tiles, then switch-first toggle, then a card-shaped preview. */
  .graph-tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .graph-tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 8px;
    border: 1px solid var(--theme-button-border);
    border-radius: 8px;
    background: var(--theme-popup-color);
    color: var(--theme-caption-color);
    text-align: left;
  }
  .graph-tile:hover:not(:disabled) {
    background: var(--theme-button-default);
  }
  .graph-tile.is-on {
    border-color: var(--primary-button-default);
    background: color-mix(in srgb, var(--primary-button-default) 10%, transparent);
  }
  .graph-tile.is-on :global(svg) {
    color: var(--primary-button-default);
  }
  .graph-tile:disabled:not(.is-on) {
    opacity: 0.5;
  }
  .graph-tile-name {
    font-size: 12.5px;
    font-weight: 500;
  }
  .graph-tile-hint {
    color: var(--theme-halfcontent-color);
    font-size: 11px;
    line-height: 1.3;
  }
  .graph-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }
  .graph-toggle-help,
  .graph-save-hint {
    color: var(--theme-halfcontent-color);
    font-size: 11.5px;
  }
  .graph-save-hint {
    margin-right: auto;
  }
  .graph-preview {
    padding: 12px;
    border: 1px solid var(--theme-divider-color);
    border-radius: 10px;
    background: var(--theme-comp-header-color);
  }
  .graph-preview-cap {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    color: var(--theme-halfcontent-color);
    font-size: 11.5px;
    font-weight: 400;
  }
  .graph-preview-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 12px;
    list-style: none;
    border: 1px solid var(--theme-divider-color);
    border-radius: 8px;
    background: var(--theme-popup-color);
  }
  .graph-preview-row {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .graph-preview-name {
    overflow: hidden;
    color: var(--theme-dark-color);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .graph-preview-box {
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--theme-refinput-border);
    border-radius: 6px;
    color: var(--theme-trans-color);
    font-size: 12.5px;
  }
  .graph-preview-row.is-edited .graph-preview-name {
    color: var(--primary-button-default);
    font-weight: 500;
  }
  .graph-preview-row.is-edited .graph-preview-box {
    border-color: var(--primary-button-outline);
  }
</style>
