<script lang="ts">
  import type { AutomationAction, ConfigSnapshot, RecordTypeInfo } from '@servone/config'
  import { Plus } from '@lucide/svelte'
  import * as Select from '../../../../lib/components/ui/select'
  import { actionChoices, actionLabel, defaultAction, isActionKind, removeAt, replaceAt, withAction } from '../automation'
  import { text } from '../strings'
  import ActionEditor from './ActionEditor.svelte'

  export let snapshot: ConfigSnapshot
  export let type: RecordTypeInfo
  export let actions: AutomationAction[]
  export let isBranch: boolean
  export let onChange: (next: AutomationAction[]) => void

  let picked = ''

  $: choices = actionChoices(actions, isBranch).filter((kind) => defaultAction(kind, snapshot, type) !== undefined)

  function add (choice: string): void {
    picked = ''
    if (!isActionKind(choice)) return
    const action = defaultAction(choice, snapshot, type)
    if (action !== undefined) onChange(withAction(actions, action))
  }
</script>

<div class="action-block grid gap-3">
  {#if actions.length > 0}
    <ol class="action-list">
      {#each actions as action, index (index)}
        <li>
          <ActionEditor
            {snapshot}
            {type}
            {action}
            onChange={(next) => {
              onChange(replaceAt(actions, index, next))
            }}
            onRemove={() => {
              onChange(removeAt(actions, index))
            }}
          />
        </li>
      {/each}
    </ol>
  {/if}
  {#if choices.length > 0}
    <!-- A select, not a menu: the e2e model picks the action by its option role. -->
    <Select.Root type="single" bind:value={picked} onValueChange={add}>
      <Select.Trigger data-id="studio-add-action" class="add-action w-full">
        <span class="flex min-w-0 items-center gap-1.5"><Plus size={16} />{text('AddAction')}</span>
      </Select.Trigger>
      <Select.Content align="start">
        {#each choices as kind (kind)}
          <Select.Item value={kind} label={actionLabel(kind)} />
        {/each}
      </Select.Content>
    </Select.Root>
  {/if}
</div>

<style>
  .action-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .action-list > li + li {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-divider-color);
  }
  .action-block :global(.add-action) {
    border-style: dashed;
  }
</style>
