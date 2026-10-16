<script lang="ts">
  import { slugify, type ConfigSnapshot, type RecordTypeInfo } from '@servone/config'
  import { Button } from '../../../../lib/components/ui/button'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import { Input } from '../../../../lib/components/ui/input'
  import { Label } from '../../../../lib/components/ui/label'
  import * as RadioGroup from '../../../../lib/components/ui/radio-group'
  import * as Select from '../../../../lib/components/ui/select'
  import type { StudioContext } from '../extensions'
  import { refusalsOf } from '../graph/outcome'
  import { addLinkOp, defaultFarName, howManyQuestion, linkDraftIssues, type LinkDraft } from '../links'
  import { text } from '../strings'
  import { activeTypes, uniqueKey } from '../type-list'

  export let studio: StudioContext
  export let snapshot: ConfigSnapshot
  export let type: RecordTypeInfo
  export let fieldName = ''
  export let targetKey = ''
  export let onClose: () => void

  const ONE = 'one'
  const MANY = 'many'
  const targets = activeTypes(snapshot)

  let draft: LinkDraft = { targetKey: '', fieldName, farFieldName: defaultFarName(type.name), isMany: false, isFarMany: true }
  let isFieldNameTouched = fieldName !== ''
  let isSaving = false
  let refusals: string[] = []

  $: target = targets.find((it) => it.key === draft.targetKey)
  $: issues = linkDraftIssues(draft)

  function pickTarget (key: string): void {
    const picked = targets.find((it) => it.key === key)
    const name = isFieldNameTouched || picked === undefined ? draft.fieldName : picked.name
    draft = { ...draft, targetKey: key, fieldName: name }
  }

  if (targetKey !== '') pickTarget(targetKey)

  async function save (): Promise<void> {
    if (isSaving || issues.length > 0) return
    isSaving = true
    try {
      const key = uniqueKey(slugify(`${type.name} ${draft.fieldName.trim()}`), new Set(snapshot.links.map((it) => it.key)))
      const outcome = await studio.save([addLinkOp(type.key, draft, key)])
      refusals = refusalsOf(outcome)
      if (outcome.kind === 'applied') onClose()
    } finally {
      isSaving = false
    }
  }
</script>

<Dialog.Root
  open
  onOpenChange={(isOpen) => {
    if (!isOpen) onClose()
  }}
>
  <Dialog.Content class="sm:max-w-lg" data-id="studio-link-dialog">
    <Dialog.Header>
      <Dialog.Title>{text('AddLink')}</Dialog.Title>
      <Dialog.Description>{text('LinksHelp')}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4">
      <div class="grid gap-1.5">
        <Label for="studio-link-target">{text('LinkTarget')}</Label>
        <Select.Root type="single" value={draft.targetKey} onValueChange={pickTarget}>
          <Select.Trigger id="studio-link-target" data-id="studio-link-target" class="w-full">
            <span class="min-w-0 truncate">{target?.name ?? text('LinkTargetPlaceholder')}</span>
          </Select.Trigger>
          <Select.Content align="start">
            {#each targets as choice (choice.key)}
              <Select.Item value={choice.key} label={choice.name} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      {#if target !== undefined}
        {@const hereQuestion = howManyQuestion(type.name, target.name)}
        {@const thereQuestion = howManyQuestion(target.name, type.name)}
        <div class="grid gap-1.5">
          <span class="text-sm leading-snug font-medium">{hereQuestion}</span>
          <RadioGroup.Root
            value={draft.isMany ? MANY : ONE}
            aria-label={hereQuestion}
            class="flex gap-6"
            onValueChange={(choice) => {
              draft = { ...draft, isMany: choice === MANY }
            }}
          >
            <label class="flex min-h-8 cursor-pointer items-center gap-2 text-sm"><RadioGroup.Item value={ONE} data-id="studio-link-here-one" />{text('One')}</label>
            <label class="flex min-h-8 cursor-pointer items-center gap-2 text-sm"><RadioGroup.Item value={MANY} data-id="studio-link-here-many" />{text('Many')}</label>
          </RadioGroup.Root>
        </div>
        <div class="grid gap-1.5">
          <span class="text-sm leading-snug font-medium">{thereQuestion}</span>
          <RadioGroup.Root
            value={draft.isFarMany ? MANY : ONE}
            aria-label={thereQuestion}
            class="flex gap-6"
            onValueChange={(choice) => {
              draft = { ...draft, isFarMany: choice === MANY }
            }}
          >
            <label class="flex min-h-8 cursor-pointer items-center gap-2 text-sm"><RadioGroup.Item value={ONE} data-id="studio-link-there-one" />{text('One')}</label>
            <label class="flex min-h-8 cursor-pointer items-center gap-2 text-sm"><RadioGroup.Item value={MANY} data-id="studio-link-there-many" />{text('Many')}</label>
          </RadioGroup.Root>
        </div>
        <div class="grid gap-4 border-t border-border pt-4">
          <div class="grid gap-1.5">
            <Label for="studio-link-field-here" class="leading-snug">{text('LinkFieldHere', { name: type.name })}</Label>
            <Input
              id="studio-link-field-here"
              data-id="studio-link-field-here"
              value={draft.fieldName}
              oninput={(e) => {
                isFieldNameTouched = true
                draft = { ...draft, fieldName: e.currentTarget.value }
              }}
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="studio-link-field-there" class="leading-snug">{text('LinkFieldHere', { name: target.name })}</Label>
            <Input
              id="studio-link-field-there"
              data-id="studio-link-field-there"
              value={draft.farFieldName}
              oninput={(e) => {
                draft = { ...draft, farFieldName: e.currentTarget.value }
              }}
            />
          </div>
        </div>
      {/if}
      {#if refusals.length > 0}
        <ul class="m-0 grid list-none gap-1 p-0 text-xs text-destructive" data-id="studio-link-refusal">
          {#each refusals as reason (reason)}<li>{reason}</li>{/each}
        </ul>
      {/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={onClose}>{text('Cancel')}</Button>
      <Button
        data-id="studio-link-save"
        disabled={isSaving || issues.length > 0}
        onclick={() => {
          void save()
        }}>{text('Save')}</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
