<script lang="ts">
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import type { AutomationAction, ConfigSnapshot, PersonTarget, RecordTypeInfo } from '@servone/config'
  import { Plus, X } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import { Checkbox } from '../../../../lib/components/ui/checkbox'
  import { Input } from '../../../../lib/components/ui/input'
  import * as Select from '../../../../lib/components/ui/select'
  import { presetLabel, PRESETS } from '../access'
  import {
    actionLabel,
    defaultTarget,
    fieldByKey,
    fieldsFor,
    isPreset,
    isTargetKind,
    linkedPeople,
    linkTargets,
    targetChoices,
    targetFieldsOf,
    targetLabel,
    targetOf,
    toggleLock,
    withLinkTarget,
    withNewValue,
    withoutValueAt,
    withPeople,
    withSetField,
    withTarget,
    withTitle,
    withValue,
    withValueAt
  } from '../automation'
  import { text } from '../strings'
  import ValueEditor from './ValueEditor.svelte'

  export let snapshot: ConfigSnapshot
  export let type: RecordTypeInfo
  export let action: AutomationAction
  export let onChange: (next: AutomationAction) => void
  export let onRemove: () => void

  let pickedValueField = ''

  $: target = targetOf(action)
  $: personFields = fieldsFor(snapshot, type, 'person')
  $: settable = fieldsFor(snapshot, type, 'set')
  $: lockable = fieldsFor(snapshot, type, 'lock')
  $: links = linkTargets(snapshot, type)
  $: linked = linkedPeople(snapshot, type)
  $: linkedFields = action.kind === 'createLinked' ? targetFieldsOf(snapshot, action.type) : []

  function setTarget (next: PersonTarget): void {
    onChange(withTarget(action, next))
  }

  function pickTargetKind (choice: string): void {
    if (isTargetKind(choice)) setTarget(defaultTarget(choice, snapshot, type))
  }

  function pickSetField (key: string): void {
    const next = fieldByKey(settable, key)
    if (next !== undefined) onChange(withSetField(next))
  }

  function pickLink (key: string): void {
    const next = links.find((link) => link.link === key)
    if (next !== undefined) onChange(withLinkTarget(next))
  }

  function addValue (key: string): void {
    const next = fieldByKey(linkedFields, key)
    if (next !== undefined) onChange(withNewValue(action, next))
    pickedValueField = ''
  }
</script>

<div class="grid gap-2" data-id="studio-action">
  <div class="flex min-h-8 items-center justify-between gap-2">
    <span class="min-w-0 truncate text-sm font-medium">{actionLabel(action.kind)}</span>
    <Button
      variant="ghost"
      size="icon-sm"
      class="text-muted-foreground"
      aria-label={text('RemoveAction')}
      title={text('RemoveAction')}
      data-id="studio-remove-action"
      onclick={onRemove}><X /></Button
    >
  </div>

  {#if target !== undefined}
    <Select.Root type="single" value={target.kind} onValueChange={pickTargetKind}>
      <Select.Trigger data-id="studio-action-target" class="w-full" title={targetLabel(target.kind)}>
        <span class="min-w-0 truncate">{targetLabel(target.kind)}</span>
      </Select.Trigger>
      <Select.Content align="start">
        {#each targetChoices(action, snapshot, type) as kind (kind)}
          <Select.Item value={kind} label={targetLabel(kind)} />
        {/each}
      </Select.Content>
    </Select.Root>
    {#if target.kind === 'field'}
      {@const fieldName = fieldByKey(personFields, target.field)?.name ?? target.field}
      <Select.Root
        type="single"
        value={target.field}
        onValueChange={(key) => {
          setTarget({ kind: 'field', field: key })
        }}
      >
        <Select.Trigger data-id="studio-action-field" class="w-full" title={fieldName}>
          <span class="min-w-0 truncate">{fieldName}</span>
        </Select.Trigger>
        <Select.Content align="start">
          {#each personFields as field (field.key)}
            <Select.Item value={field.key} label={field.name} />
          {/each}
        </Select.Content>
      </Select.Root>
    {:else if target.kind === 'people'}
      <div data-id="studio-action-people">
        <AccountArrayEditor
          label={getEmbeddedLabel(targetLabel('people'))}
          value={target.people}
          onChange={(people) => {
            setTarget(withPeople(people, action.kind === 'createTodo'))
          }}
        />
      </div>
    {:else if target.kind === 'linked'}
      {@const linkedName = linked.find((person) => person.link === target.link && person.field === target.field)?.label ?? target.field}
      <Select.Root
        type="single"
        value={`${target.link}:${target.field}`}
        onValueChange={(id) => {
          const person = linked.find((choice) => choice.id === id)
          if (person !== undefined) setTarget({ kind: 'linked', link: person.link, field: person.field })
        }}
      >
        <Select.Trigger data-id="studio-action-linked" class="w-full" title={linkedName}>
          <span class="min-w-0 truncate">{linkedName}</span>
        </Select.Trigger>
        <Select.Content align="start">
          {#each linked as person (person.id)}
            <Select.Item value={person.id} label={person.label} />
          {/each}
        </Select.Content>
      </Select.Root>
    {:else if target.kind === 'preset'}
      <Select.Root
        type="single"
        value={target.preset}
        onValueChange={(choice) => {
          if (isPreset(choice)) setTarget({ kind: 'preset', preset: choice })
        }}
      >
        <Select.Trigger data-id="studio-action-preset" class="w-full" title={presetLabel(target.preset)}>
          <span class="min-w-0 truncate">{presetLabel(target.preset)}</span>
        </Select.Trigger>
        <Select.Content align="start">
          {#each PRESETS as preset (preset)}
            <Select.Item value={preset} label={presetLabel(preset)} />
          {/each}
        </Select.Content>
      </Select.Root>
    {/if}
    {#if action.kind === 'requestApproval'}
      <p class="m-0 text-xs text-muted-foreground">{text('AllMustApprove')}</p>
    {/if}
    {#if target.kind === 'linked'}
      <p class="m-0 text-xs text-muted-foreground">{text('LinkedFirstNote')}</p>
    {/if}
  {/if}

  {#if action.kind === 'createTodo'}
    <Input
      data-id="studio-todo-title"
      aria-label={text('TodoTitlePlaceholder')}
      value={action.title}
      placeholder={text('TodoTitlePlaceholder')}
      oninput={(event) => {
        onChange(withTitle(action, event.currentTarget.value))
      }}
    />
  {:else if action.kind === 'setField'}
    {@const field = fieldByKey(settable, action.field)}
    <Select.Root type="single" value={action.field} onValueChange={pickSetField}>
      <Select.Trigger data-id="studio-set-field" class="w-full" title={field?.name ?? action.field}>
        <span class="min-w-0 truncate">{field?.name ?? action.field}</span>
      </Select.Trigger>
      <Select.Content align="start">
        {#each settable as choice (choice.key)}
          <Select.Item value={choice.key} label={choice.name} />
        {/each}
      </Select.Content>
    </Select.Root>
    {#if field !== undefined}
      <ValueEditor
        {field}
        fieldValue={action.value}
        onChange={(next) => {
          onChange(withValue(action, next))
        }}
      />
    {/if}
  {:else if action.kind === 'createLinked'}
    {@const linkName = links.find((link) => link.link === action.link)?.label ?? action.link}
    <Select.Root type="single" value={action.link} onValueChange={pickLink}>
      <Select.Trigger data-id="studio-linked-type" class="w-full" title={linkName}>
        <span class="min-w-0 truncate">{linkName}</span>
      </Select.Trigger>
      <Select.Content align="start">
        {#each links as choice (choice.link)}
          <Select.Item value={choice.link} label={choice.label} />
        {/each}
      </Select.Content>
    </Select.Root>
    <Input
      data-id="studio-linked-title"
      aria-label={text('LinkedTitle')}
      placeholder={text('LinkedTitle')}
      value={action.title}
      oninput={(event) => {
        onChange(withTitle(action, event.currentTarget.value))
      }}
    />
    {#each action.values as assignment, index (index)}
      {@const valueField = fieldByKey(linkedFields, assignment.field)}
      <div class="grid gap-1.5">
        <span class="truncate text-xs text-muted-foreground" title={valueField?.name ?? assignment.field}>
          {valueField?.name ?? assignment.field}
        </span>
        <div class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            {#if valueField !== undefined}
              <ValueEditor
                field={valueField}
                fieldValue={assignment.value}
                onChange={(next) => {
                  onChange(withValueAt(action, index, next))
                }}
              />
            {/if}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            aria-label={text('RemoveValue')}
            title={text('RemoveValue')}
            data-id="studio-linked-remove-value"
            onclick={() => {
              onChange(withoutValueAt(action, index))
            }}><X /></Button
          >
        </div>
      </div>
    {/each}
    {#if linkedFields.length > 0}
      <Select.Root type="single" bind:value={pickedValueField} onValueChange={addValue}>
        <Select.Trigger data-id="studio-linked-add-value" class="w-full">
          <span class="flex min-w-0 items-center gap-1.5"><Plus size={16} />{text('AddValue')}</span>
        </Select.Trigger>
        <Select.Content align="start">
          {#each linkedFields as choice (choice.key)}
            <Select.Item value={choice.key} label={choice.name} />
          {/each}
        </Select.Content>
      </Select.Root>
    {/if}
  {:else if action.kind === 'lockField'}
    <div class="grid gap-2">
      {#each lockable as field (field.key)}
        <label class="flex min-h-8 items-center gap-2 text-sm" data-id="studio-lock-field">
          <Checkbox
            checked={action.fields.includes(field.key)}
            onCheckedChange={(isChecked) => {
              onChange(toggleLock(action, field.key, isChecked))
            }}
          />
          <span class="min-w-0 break-words">{field.name}</span>
        </label>
      {/each}
    </div>
  {/if}
</div>
