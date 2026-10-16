<script lang="ts">
  import {
    isSensitiveAutomation,
    slugify,
    type ConfigSnapshot,
    type FieldValue,
    type RecordTypeInfo
  } from '@servone/config'
  import { CircleCheck, CircleX, TriangleAlert } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import { Input } from '../../../../lib/components/ui/input'
  import { Label } from '../../../../lib/components/ui/label'
  import * as Select from '../../../../lib/components/ui/select'
  import {
    defaultTrigger,
    draftIssues,
    endsWithApproval,
    fieldByKey,
    fieldsFor,
    isTriggerKind,
    moneyFieldLookup,
    offsetParts,
    ruleOp,
    ruleRows,
    ruleSpec,
    TRIGGER_KINDS,
    triggerFieldOf,
    triggerLabel,
    wholeDays,
    withActions,
    withOffset,
    withTriggerField,
    withTriggerValue,
    type RuleDraft
  } from '../automation'
  import type { StudioContext } from '../extensions'
  import { refusalsOf } from '../graph/outcome'
  import { landingState } from '../graph/phrases'
  import { text } from '../strings'
  import { uniqueKey } from '../type-list'
  import ActionList from './ActionList.svelte'
  import ValueEditor from './ValueEditor.svelte'

  export let studio: StudioContext
  export let snapshot: ConfigSnapshot
  export let type: RecordTypeInfo
  export let draft: RuleDraft
  export let onClose: () => void

  let isSaving = false
  let refusals: string[] = []

  $: issues = draftIssues(draft, ruleRows(type))
  const startDraft = JSON.stringify(draft)
  $: isTouched = draft.key !== undefined || JSON.stringify(draft) !== startDraft
  $: triggerFields = fieldsFor(snapshot, type, draft.trigger.kind === 'date' ? 'date' : 'change')
  $: triggerField = triggerFieldOf(snapshot, type, draft.trigger)
  $: offset = offsetParts(draft.trigger)
  $: isSensitive = needsApproval(snapshot, type, draft)

  function needsApproval (current: ConfigSnapshot, owner: RecordTypeInfo, rule: RuleDraft): boolean {
    const stored = owner.automations.find((existing) => existing.key === rule.key)?.automation ?? null
    const isMoneyField = moneyFieldLookup(current)
    return [ruleSpec(rule), stored].some((spec) => spec !== null && isSensitiveAutomation(owner.key, spec, isMoneyField))
  }

  function pickTrigger (choice: string): void {
    if (!isTriggerKind(choice)) return
    const trigger = defaultTrigger(choice, snapshot, type)
    if (trigger !== undefined) draft = { ...draft, trigger }
  }

  function pickTriggerField (key: string): void {
    const field = fieldByKey(triggerFields, key)
    if (field !== undefined) draft = { ...draft, trigger: withTriggerField(draft.trigger, field) }
  }

  function setTriggerValue (to: FieldValue): void {
    draft = { ...draft, trigger: withTriggerValue(draft.trigger, to) }
  }

  function setOffset (days: number, isBefore: boolean): void {
    draft = { ...draft, trigger: withOffset(draft.trigger, days, isBefore) }
  }

  async function save (): Promise<void> {
    if (isSaving || issues.length > 0) return
    isSaving = true
    try {
      const key = draft.key ?? uniqueKey(slugify(draft.name.trim()), new Set(type.automations.map((rule) => rule.key)))
      const outcome = await studio.save([ruleOp(type.key, key, draft)])
      refusals = refusalsOf(outcome)
      if (outcome.kind === 'applied' || outcome.kind === 'pending') onClose()
    } finally {
      isSaving = false
    }
  }
</script>

<div class="grid gap-4" data-id="studio-rule-editor">
  <div class="grid gap-1.5">
    <Label for="studio-rule-name">{text('RuleName')}</Label>
    <Input
      id="studio-rule-name"
      data-id="studio-rule-name"
      bind:value={draft.name}
      placeholder={text('RuleNamePlaceholder')}
      autocomplete="off"
    />
  </div>

  <section class="rule-step" aria-labelledby="studio-rule-when">
    <h3 class="rule-step-head" id="studio-rule-when">{text('When')}</h3>
    <Select.Root type="single" value={draft.trigger.kind} onValueChange={pickTrigger}>
      <Select.Trigger data-id="studio-rule-trigger" class="w-full" title={triggerLabel(draft.trigger.kind)}>
        <span class="min-w-0 truncate">{triggerLabel(draft.trigger.kind)}</span>
      </Select.Trigger>
      <Select.Content align="start">
        {#each TRIGGER_KINDS as kind (kind)}
          <Select.Item value={kind} label={triggerLabel(kind)} disabled={defaultTrigger(kind, snapshot, type) === undefined} />
        {/each}
      </Select.Content>
    </Select.Root>
    {#if triggerField !== undefined}
      {@const field = triggerField}
      <Select.Root type="single" value={field.key} onValueChange={pickTriggerField}>
        <Select.Trigger data-id="studio-rule-trigger-field" class="w-full" title={field.name}>
          <span class="min-w-0 truncate">{field.name}</span>
        </Select.Trigger>
        <Select.Content align="start">
          {#each triggerFields as choice (choice.key)}
            <Select.Item value={choice.key} label={choice.name} />
          {/each}
        </Select.Content>
      </Select.Root>
      {#if draft.trigger.kind === 'fieldChanged'}
        <div class="flex items-center gap-2">
          <span class="shrink-0 text-sm text-muted-foreground">{text('ChangesTo')}</span>
          <div class="min-w-0 flex-1">
            <ValueEditor {field} fieldValue={draft.trigger.to} onChange={setTriggerValue} />
          </div>
        </div>
      {:else if offset !== undefined}
        {@const parts = offset}
        <div class="flex items-center gap-2">
          <Input
            data-id="studio-rule-days"
            type="number"
            min="0"
            class="w-16"
            aria-label={text('Days')}
            value={String(parts.days)}
            onchange={(event) => {
              const input = event.currentTarget
              const days = wholeDays(Number(input.value))
              input.value = String(days)
              setOffset(days, parts.isBefore)
            }}
          />
          <span class="text-sm text-muted-foreground">{text('Days')}</span>
          <Select.Root
            type="single"
            value={parts.isBefore ? 'before' : 'after'}
            onValueChange={(choice) => {
              setOffset(parts.days, choice === 'before')
            }}
          >
            <Select.Trigger data-id="studio-rule-direction" class="w-24">
              {parts.isBefore ? text('Before') : text('After')}
            </Select.Trigger>
            <Select.Content align="start">
              <Select.Item value="before" label={text('Before')} />
              <Select.Item value="after" label={text('After')} />
            </Select.Content>
          </Select.Root>
        </div>
      {/if}
    {/if}
  </section>

  <section class="rule-step" aria-labelledby="studio-rule-then">
    <h3 class="rule-step-head capitalize" id="studio-rule-then">{text('Then')}</h3>
    <ActionList
      {snapshot}
      {type}
      actions={draft.actions}
      isBranch={false}
      onChange={(actions) => {
        draft = withActions(draft, actions)
      }}
    />
  </section>

  {#if endsWithApproval(draft.actions)}
    <div class="grid gap-3" data-id="studio-rule-branches">
      <section class="rule-path is-approved">
        <div class="rule-path-head">
          <CircleCheck size={16} />
          <span class="min-w-0 truncate">{text('ApprovalIfApproved')}</span>
          <span class="rule-path-state">{landingState(draft.trigger, draft.onApproved)}</span>
        </div>
        <ActionList
          {snapshot}
          {type}
          actions={draft.onApproved}
          isBranch
          onChange={(actions) => {
            draft = { ...draft, onApproved: actions }
          }}
        />
      </section>
      <section class="rule-path is-rejected">
        <div class="rule-path-head">
          <CircleX size={16} />
          <span class="min-w-0 truncate">{text('ApprovalIfRejected')}</span>
          <span class="rule-path-state">{landingState(draft.trigger, draft.onRejected)}</span>
        </div>
        <ActionList
          {snapshot}
          {type}
          actions={draft.onRejected}
          isBranch
          onChange={(actions) => {
            draft = { ...draft, onRejected: actions }
          }}
        />
      </section>
    </div>
  {/if}

  <footer class="rule-foot">
    {#if isTouched && issues.length > 0}
      <ul class="m-0 grid list-none gap-1 p-0 text-xs text-destructive">
        {#each issues as key (key)}<li data-id="studio-rule-issue">{text(key)}</li>{/each}
      </ul>
    {/if}
    {#if refusals.length > 0}
      <ul class="m-0 grid list-none gap-1 p-0 text-xs text-destructive" data-id="graph-panel-refusal">
        {#each refusals as reason (reason)}<li>{reason}</li>{/each}
      </ul>
    {/if}
    {#if isSensitive}
      <p class="rule-warn"><TriangleAlert size={14} />{text('ApprovalSecondAdmin')}</p>
    {/if}
    <div class="flex justify-end gap-2">
      <Button variant="outline" size="sm" data-id="studio-rule-cancel" onclick={onClose}>{text('Cancel')}</Button>
      <Button
        size="sm"
        data-id="studio-rule-save"
        disabled={issues.length > 0 || isSaving}
        onclick={() => {
          void save()
        }}>{isSensitive ? text('SendForApproval') : text('Save')}</Button
      >
    </div>
  </footer>
</div>

<style>
  .rule-step {
    display: grid;
    gap: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--theme-divider-color);
  }
  .rule-step-head {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
  }
  .rule-path {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    border-left: 3px solid;
    border-radius: 0 8px 8px 0;
    background: var(--theme-button-default);
  }
  .rule-path.is-approved {
    border-left-color: var(--theme-state-positive-color);
  }
  .rule-path.is-rejected {
    border-left-color: var(--theme-state-negative-color);
  }
  .rule-path-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .rule-path-head :global(svg) {
    flex-shrink: 0;
  }
  .is-approved .rule-path-head {
    color: var(--theme-state-positive-color);
  }
  .is-rejected .rule-path-head {
    color: var(--theme-state-negative-color);
  }
  .rule-path-state {
    flex-shrink: 0;
    height: 20px;
    margin-left: auto;
    padding: 0 8px;
    border-radius: 10px;
    background: var(--theme-bg-accent-color);
    color: var(--theme-dark-color);
    font-size: 11px;
    font-weight: 400;
    line-height: 20px;
  }
  .rule-foot {
    display: grid;
    gap: 8px;
  }
  /* Inside the graph panel the body scrolls, so pin the buttons like PanelShell's own footer. */
  :global(.graph-panel-body) .rule-foot {
    position: sticky;
    bottom: 0;
    margin: 0 -16px -16px;
    padding: 12px 16px;
    border-top: 1px solid var(--theme-divider-color);
    background: var(--theme-popup-color);
  }
  .rule-warn {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--theme-button-warning-border);
    border-radius: 8px;
    background: var(--theme-button-warning-bg);
    color: var(--theme-button-warning-color);
    font-size: 12px;
  }
  .rule-warn :global(svg) {
    flex-shrink: 0;
  }
</style>
