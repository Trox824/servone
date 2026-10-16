<script lang="ts">
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { slugify, type ConfigSnapshot, type RecordTypeInfo } from '@servone/config'
  import { Building, ChevronDown, CircleCheck, CircleX, ShieldCheck, TriangleAlert, User, UserRoundSearch } from '@lucide/svelte'
  import { Button } from '../../../../../lib/components/ui/button'
  import * as DropdownMenu from '../../../../../lib/components/ui/dropdown-menu'
  import { draftIssues, ruleOp, ruleRows, withPeople, type RuleDraft } from '../../automation'
  import RuleEditor from '../../components/RuleEditor.svelte'
  import ActionList from '../../components/ActionList.svelte'
  import type { StudioContext } from '../../extensions'
  import { text } from '../../strings'
  import { uniqueKey } from '../../type-list'
  import {
    APPROVER_GROUPS,
    approverChoices,
    approverGroupLabel,
    approverOf,
    choiceIdOf,
    triggerChoices,
    withApproverChoice,
    type ApproverChoice
  } from '../approval'
  import { refusalsOf } from '../outcome'
  import { approverPhrase, landingState, triggerPhrase } from '../phrases'
  import PanelShell from './PanelShell.svelte'

  export let studio: StudioContext
  export let snapshot: ConfigSnapshot
  export let type: RecordTypeInfo
  export let draft: RuleDraft
  export let onClose: () => void

  const GROUP_ICONS = {
    question: UserRoundSearch,
    linked: Building,
    role: ShieldCheck,
    people: User
  }

  let isDetailed = false
  let isSaving = false
  let refusals: string[] = []

  $: approver = approverOf(draft)
  $: choices = approverChoices(snapshot, type)
  $: triggers = triggerChoices(snapshot, type)
  $: issues = draftIssues(draft, ruleRows(type))

  function pickApprover (choice: ApproverChoice): void {
    if (approver !== undefined && choiceIdOf(approver) === choice.id) return
    draft = withApproverChoice(draft, choice.target)
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

<PanelShell
  kicker={text('GraphKickerProcess', { name: type.name })}
  title={draft.name === '' ? text('ApprovalTitle') : draft.name}
  isFooterShown={!isDetailed}
  {onClose}
>
  {#if isDetailed}
    <RuleEditor {studio} {snapshot} {type} {draft} {onClose} />
  {:else}
    <p class="graph-sentence" data-id="graph-approval-sentence">
      <span>{text('ApprovalWhen')}</span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger class="graph-slot" data-id="graph-approval-trigger">
          {triggerPhrase(snapshot, type, draft.trigger)}<ChevronDown size={14} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="w-72">
          {#each triggers as choice (choice.id)}
            <DropdownMenu.Item
              class="px-2"
              onSelect={() => {
                draft = { ...draft, trigger: choice.trigger }
              }}>{choice.label}</DropdownMenu.Item
            >
          {/each}
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            class="px-2"
            data-id="graph-approval-detail"
            onSelect={() => {
              isDetailed = true
            }}>{text('ApprovalMoreDetail')}</DropdownMenu.Item
          >
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <span>{text('ApprovalSendTo')}</span>
      {#if approver !== undefined}
        {@const currentId = choiceIdOf(approver)}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger class="graph-slot" data-id="graph-approver">
            {approverPhrase(snapshot, type, approver)}<ChevronDown size={14} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-80 text-left">
            {#each APPROVER_GROUPS as group (group)}
              {@const inGroup = choices.filter((choice) => choice.group === group)}
              {#if inGroup.length > 0}
                <DropdownMenu.Group>
                  <DropdownMenu.GroupHeading class="px-2 pt-2 pb-1 text-left text-[11px] font-normal">
                    {approverGroupLabel(group, type)}
                  </DropdownMenu.GroupHeading>
                  {#each inGroup as choice (choice.id)}
                    <DropdownMenu.Item
                      class="graph-approver-item min-h-8 gap-2 pr-2 pl-5 {choice.id === currentId ? 'is-on' : ''}"
                      data-id={`graph-approver-${choice.id}`}
                      aria-current={choice.id === currentId}
                      onSelect={() => {
                        pickApprover(choice)
                      }}
                    >
                      <svelte:component this={GROUP_ICONS[group]} size={15} class="graph-approver-icon" />
                      <span class="min-w-0 flex-1 truncate text-left">{choice.label}</span>
                      {#if choice.hint !== ''}<span class="shrink-0 text-[11px] text-muted-foreground">{choice.hint}</span>{/if}
                    </DropdownMenu.Item>
                  {/each}
                </DropdownMenu.Group>
              {/if}
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
      <span>{text('ApprovalToApprove')}</span>
    </p>
    {#if approver?.kind === 'people'}
      <div data-id="graph-approver-people">
        <AccountArrayEditor
          label={getEmbeddedLabel(text('Approver'))}
          value={approver.people}
          onChange={(people) => {
            draft = withApproverChoice(draft, withPeople(people, false))
          }}
        />
      </div>
    {/if}
    <p class="m-0 text-xs text-muted-foreground">{text('ApprovalNote')}</p>
    {#if approver?.kind === 'linked'}
      <p class="m-0 text-xs text-muted-foreground">{text('LinkedFirstNote')}</p>
    {/if}
    <section class="graph-path is-approved" data-id="graph-approval-approved">
      <div class="graph-path-head">
        <CircleCheck size={16} />
        <span class="graph-path-label">{text('ApprovalIfApproved')}</span>
        <span class="graph-path-state">{landingState(draft.trigger, draft.onApproved)}</span>
      </div>
      <ActionList
        {snapshot}
        {type}
        actions={draft.onApproved}
        isBranch
        onChange={(next) => {
          draft = { ...draft, onApproved: next }
        }}
      />
    </section>
    <section class="graph-path is-rejected" data-id="graph-approval-rejected">
      <div class="graph-path-head">
        <CircleX size={16} />
        <span class="graph-path-label">{text('ApprovalIfRejected')}</span>
        <span class="graph-path-state">{landingState(draft.trigger, draft.onRejected)}</span>
      </div>
      <ActionList
        {snapshot}
        {type}
        actions={draft.onRejected}
        isBranch
        onChange={(next) => {
          draft = { ...draft, onRejected: next }
        }}
      />
    </section>
  {/if}
  <svelte:fragment slot="footer">
    {#if !isDetailed}
      {#if issues.length > 0}
        <ul class="m-0 grid list-none gap-1 p-0 text-xs text-destructive" data-id="graph-panel-issues">
          {#each issues as issue (issue)}<li>{text(issue)}</li>{/each}
        </ul>
      {/if}
      {#if refusals.length > 0}
        <ul class="m-0 grid list-none gap-1 p-0 text-xs text-destructive" data-id="graph-panel-refusal">
          {#each refusals as reason (reason)}<li>{reason}</li>{/each}
        </ul>
      {/if}
      <p class="graph-warn" data-id="graph-approval-second-admin"><TriangleAlert size={14} />{text('ApprovalSecondAdmin')}</p>
      <div class="flex justify-end gap-2">
        <Button variant="outline" size="sm" onclick={onClose}>{text('Cancel')}</Button>
        <Button
          size="sm"
          data-id="graph-approval-save"
          disabled={isSaving || issues.length > 0}
          onclick={() => {
            void save()
          }}>{text('ApprovalSend')}</Button
        >
      </div>
    {/if}
  </svelte:fragment>
</PanelShell>

<style>
  .graph-sentence {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 14px;
    line-height: 32px;
  }
  .graph-sentence :global(.graph-slot) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 32px;
    padding: 0 8px;
    border-radius: 6px;
    background: var(--primary-button-transparent);
    color: var(--primary-button-default);
    font-weight: 600;
  }
  :global(.graph-approver-item .graph-approver-icon) {
    color: var(--theme-halfcontent-color);
  }
  :global(.graph-approver-item.is-on) {
    background: var(--primary-button-transparent);
  }
  :global(.graph-approver-item.is-on .graph-approver-icon) {
    color: var(--primary-button-default);
  }
  .graph-path {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    border-left: 3px solid;
    border-radius: 0 8px 8px 0;
    background: var(--theme-button-default);
  }
  .graph-path.is-approved {
    border-left-color: var(--theme-state-positive-color);
  }
  .graph-path.is-rejected {
    border-left-color: var(--theme-state-negative-color);
  }
  .graph-path-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .is-approved .graph-path-head {
    color: var(--theme-state-positive-color);
  }
  .is-rejected .graph-path-head {
    color: var(--theme-state-negative-color);
  }
  .graph-path-state {
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
  .graph-warn {
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
</style>
