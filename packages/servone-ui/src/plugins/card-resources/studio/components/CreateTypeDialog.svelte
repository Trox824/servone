<script lang="ts">
  import { slugify, type ConfigSnapshot } from '@servone/config'
  import { Button } from '../../../../lib/components/ui/button'
  import { Checkbox } from '../../../../lib/components/ui/checkbox'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import { Input } from '../../../../lib/components/ui/input'
  import { Label } from '../../../../lib/components/ui/label'
  import * as Select from '../../../../lib/components/ui/select'
  import { TAB_ID, type StudioContext } from '../extensions'
  import { refusalsOf } from '../graph/outcome'
  import { text } from '../strings'
  import { activeSpaces, activeTypes, createTypeOp, isNameTaken, takenKeys, uniqueKey } from '../type-list'

  export let snapshot: ConfigSnapshot
  export let studio: StudioContext
  export let onClose: () => void

  const NO_BASE = 'none'
  const spaceChoices = activeSpaces(snapshot)
  const bases = activeTypes(snapshot)

  let name = ''
  let basedOn = NO_BASE
  let spaces = spaceChoices.map((it) => it.id)
  let isSaving = false
  let refusals: string[] = []

  $: trimmed = name.trim()
  $: isTaken = trimmed !== '' && isNameTaken(snapshot, trimmed)
  $: canCreate = trimmed !== '' && !isTaken && !isSaving
  $: baseLabel = bases.find((it) => it.key === basedOn)?.name ?? text('BasedOnNone')

  function toggleSpace (id: string, isChecked: boolean): void {
    spaces = isChecked ? [...spaces, id] : spaces.filter((it) => it !== id)
  }

  async function create (): Promise<void> {
    if (!canCreate) return
    isSaving = true
    try {
      const key = uniqueKey(slugify(trimmed), takenKeys(snapshot))
      const outcome = await studio.save([createTypeOp(key, trimmed, basedOn === NO_BASE ? undefined : basedOn, spaces)])
      refusals = refusalsOf(outcome)
      if (outcome.kind === 'applied') {
        onClose()
        studio.open({ kind: 'type', typeKey: key, tab: TAB_ID.fields })
      }
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
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{text('CreateType')}</Dialog.Title>
    </Dialog.Header>
    <form
      class="grid gap-4"
      on:submit|preventDefault={() => {
        void create()
      }}
    >
      <div class="grid gap-1.5">
        <Label for="studio-new-type-name">{text('TypeName')}</Label>
        <Input
          id="studio-new-type-name"
          data-id="studio-new-type-name"
          bind:value={name}
          placeholder={text('TypeNamePlaceholder')}
          autocomplete="off"
        />
        {#if isTaken}<p class="m-0 text-xs text-destructive">{text('NameTaken')}</p>{/if}
      </div>
      <div class="grid gap-1.5">
        <Label for="studio-new-type-base">{text('BasedOn')}</Label>
        <Select.Root
          type="single"
          value={basedOn}
          onValueChange={(picked) => {
            basedOn = picked
          }}
        >
          <Select.Trigger id="studio-new-type-base" class="w-full">
            <span class="min-w-0 truncate">{baseLabel}</span>
          </Select.Trigger>
          <Select.Content align="start">
            <Select.Item value={NO_BASE} label={text('BasedOnNone')} />
            {#each bases as base (base.key)}
              <Select.Item value={base.key} label={base.name} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      {#if spaceChoices.length > 0}
        <div class="grid gap-1.5" role="group" aria-labelledby="studio-new-type-spaces">
          <span id="studio-new-type-spaces" class="text-sm leading-none font-medium">{text('ShownIn')}</span>
          <div class="studio-space-list">
            {#each spaceChoices as choice (choice.id)}
              <label class="flex min-h-8 min-w-0 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={spaces.includes(choice.id)}
                  onCheckedChange={(isChecked) => {
                    toggleSpace(choice.id, isChecked)
                  }}
                />
                <span class="truncate" title={choice.name}>{choice.name}</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}
      {#if refusals.length > 0}
        <ul class="m-0 grid list-none gap-1 p-0 text-xs text-destructive" data-id="studio-create-type-refusal">
          {#each refusals as reason (reason)}<li>{reason}</li>{/each}
        </ul>
      {/if}
      <Dialog.Footer>
        <Button variant="outline" onclick={onClose}>{text('Cancel')}</Button>
        <Button data-track="studio.type_create.submit" type="submit" data-id="studio-create-type-confirm" disabled={!canCreate}>{text('Create')}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<style>
  /* Long space lists scroll inside the dialog instead of pushing the buttons off screen. */
  .studio-space-list {
    display: grid;
    max-height: 192px;
    overflow-y: auto;
  }
</style>
