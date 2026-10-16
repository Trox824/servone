<script lang="ts">
  import { ArrowDown, ArrowUp, Plus, RotateCcw, X } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import { Input } from '../../../../lib/components/ui/input'
  import * as Select from '../../../../lib/components/ui/select'
  import {
    addOption,
    keptOptions,
    mapOption,
    moveOption,
    removeOption,
    renameOption,
    restoreOption,
    type OptionEdit
  } from '../fields'
  import { text } from '../strings'

  export let edits: OptionEdit[]
  export let isExisting: boolean
  export let onChange: (next: OptionEdit[]) => void

  const KEEP_EMPTY = 'empty'

  $: kept = keptOptions(edits)

  function mapLabel (edit: OptionEdit): string {
    return kept.find((it) => it.id === edit.mapToId)?.label ?? text('KeepEmpty')
  }

  function pickMapTarget (edit: OptionEdit, choice: string): void {
    onChange(mapOption(edits, edit.id, choice === KEEP_EMPTY ? undefined : Number(choice)))
  }
</script>

<div class="grid gap-2">
  {#each edits as edit, index (edit.id)}
    <div class="grid gap-2" data-id="studio-option-row">
      <div class="flex min-w-0 items-center gap-1">
        <Input
          data-id="studio-option-input"
          aria-label={text('Options')}
          value={edit.label}
          disabled={edit.isRemoved}
          class={edit.isRemoved ? 'line-through' : ''}
          placeholder={text('OptionPlaceholder')}
          oninput={(e) => {
            onChange(renameOption(edits, edit.id, e.currentTarget.value))
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label={text('MoveUp')}
          title={text('MoveUp')}
          disabled={index === 0}
          onclick={() => {
            onChange(moveOption(edits, edit.id, -1))
          }}><ArrowUp /></Button
        >
        <Button
          variant="ghost"
          size="icon"
          aria-label={text('MoveDown')}
          title={text('MoveDown')}
          disabled={index === edits.length - 1}
          onclick={() => {
            onChange(moveOption(edits, edit.id, 1))
          }}><ArrowDown /></Button
        >
        {#if edit.isRemoved}
          <Button
            variant="ghost"
            size="icon"
            aria-label={text('RestoreOption')}
            title={text('RestoreOption')}
            onclick={() => {
              onChange(restoreOption(edits, edit.id))
            }}><RotateCcw /></Button
          >
        {:else}
          <Button
            variant="ghost"
            size="icon"
            data-id="studio-option-remove"
            aria-label={text('RemoveOption')}
            title={text('RemoveOption')}
            onclick={() => {
              onChange(removeOption(edits, edit.id))
            }}><X /></Button
          >
        {/if}
      </div>
      {#if isExisting && edit.isRemoved}
        <div class="grid gap-1.5">
          <span class="text-xs text-muted-foreground">{text('MoveValuesTo')}</span>
          <Select.Root
            type="single"
            value={edit.mapToId !== undefined ? String(edit.mapToId) : KEEP_EMPTY}
            onValueChange={(choice) => {
              pickMapTarget(edit, choice)
            }}
          >
            <Select.Trigger data-id="studio-option-map-to" class="w-full">
              <span class="min-w-0 truncate">{mapLabel(edit)}</span>
            </Select.Trigger>
            <Select.Content align="start">
              <Select.Item value={KEEP_EMPTY} label={text('KeepEmpty')} />
              {#each kept as target (target.id)}
                <Select.Item value={String(target.id)} label={target.label} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {/if}
    </div>
  {/each}
  <Button
    variant="outline"
    data-id="studio-add-option"
    class="justify-self-start"
    onclick={() => {
      onChange(addOption(edits))
    }}><Plus />{text('AddOption')}</Button
  >
</div>
