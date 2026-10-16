<script lang="ts">
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import type { FieldInfo, FieldValue } from '@servone/config'
  import { Input } from '../../../../lib/components/ui/input'
  import * as Select from '../../../../lib/components/ui/select'
  import { Switch } from '../../../../lib/components/ui/switch'
  import { accountValue, numberValue } from '../automation'
  import { text } from '../strings'

  export let field: FieldInfo
  export let fieldValue: FieldValue
  export let onChange: (next: FieldValue) => void

  $: optionLabel = typeof fieldValue === 'string' && fieldValue !== '' ? fieldValue : text('PickValue')
</script>

{#if field.kind.kind === 'select'}
  <Select.Root
    type="single"
    value={typeof fieldValue === 'string' ? fieldValue : ''}
    onValueChange={(option) => {
      onChange(option)
    }}
  >
    <Select.Trigger data-id="studio-rule-value" class="w-full" aria-label={field.name} title={optionLabel}>
      <span class="min-w-0 truncate">{optionLabel}</span>
    </Select.Trigger>
    <Select.Content align="start">
      {#each field.kind.options as option (option)}
        <Select.Item value={option} label={option} />
      {/each}
    </Select.Content>
  </Select.Root>
{:else if field.kind.kind === 'boolean'}
  <Switch
    data-id="studio-rule-value"
    checked={fieldValue === true}
    aria-label={field.name}
    onCheckedChange={(isChecked) => {
      onChange(isChecked)
    }}
  />
{:else if field.kind.kind === 'number' || field.kind.kind === 'money'}
  <Input
    data-id="studio-rule-value"
    type="number"
    aria-label={field.name}
    value={typeof fieldValue === 'number' ? String(fieldValue) : ''}
    oninput={(event) => {
      onChange(numberValue(event.currentTarget.value))
    }}
  />
{:else if field.kind.kind === 'person'}
  <div data-id="studio-rule-value">
    <AccountArrayEditor
      label={getEmbeddedLabel(field.name)}
      value={accountValue(fieldValue)}
      onChange={(people) => {
        onChange(people.at(-1) ?? null)
      }}
    />
  </div>
{:else}
  <Input
    data-id="studio-rule-value"
    aria-label={field.name}
    value={typeof fieldValue === 'string' ? fieldValue : ''}
    oninput={(event) => {
      onChange(event.currentTarget.value)
    }}
  />
{/if}
