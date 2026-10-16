<script lang="ts">
  import { ConfigError, exportPack, slugify, type ConfigSnapshot } from '@servone/config'
  import { Button } from '../../../../lib/components/ui/button'
  import { Checkbox } from '../../../../lib/components/ui/checkbox'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import { Input } from '../../../../lib/components/ui/input'
  import { Label } from '../../../../lib/components/ui/label'
  import { Textarea } from '../../../../lib/components/ui/textarea'
  import type { StudioContext } from '../extensions'
  import { showError } from '../huly'
  import { addedParents, packFileName, packFileText, withParents } from '../packs'
  import { text } from '../strings'
  import { customerTypes } from '../type-list'

  export let snapshot: ConfigSnapshot
  export let studio: StudioContext
  export let onClose: () => void

  const FIRST_VERSION = 1
  const choices = customerTypes(snapshot)

  let selected: string[] = []
  let name = ''
  let description = ''
  let industry = ''
  let isSaving = false

  $: trimmed = name.trim()
  $: packKey = slugify(trimmed)
  $: parents = addedParents(snapshot, selected)
  $: canExport = selected.length > 0 && packKey !== '' && !isSaving

  function toggle (typeKey: string, isChecked: boolean): void {
    selected = isChecked ? [...selected, typeKey] : selected.filter((it) => it !== typeKey)
  }

  function download (fileName: string, body: string): void {
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  async function save (): Promise<void> {
    if (!canExport) return
    isSaving = true
    try {
      const pack = await exportPack(studio.session, withParents(snapshot, selected), {
        key: packKey,
        version: FIRST_VERSION,
        name: trimmed,
        description: description.trim(),
        industry: industry.trim()
      })
      download(packFileName(pack.key), packFileText(pack))
      onClose()
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err
      showError(err.message)
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
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{text('ExportPack')}</Dialog.Title>
      <Dialog.Description>{text('ExportPackHelp')}</Dialog.Description>
    </Dialog.Header>
    {#if choices.length === 0}
      <p class="m-0 text-sm text-muted-foreground">{text('ExportNoTypes')}</p>
    {:else}
      <form
        class="grid gap-4"
        on:submit|preventDefault={() => {
          void save()
        }}
      >
        <div class="grid gap-2">
          <Label for="studio-pack-name">{text('PackName')}</Label>
          <Input
            id="studio-pack-name"
            data-id="studio-pack-name"
            bind:value={name}
            placeholder={text('PackNamePlaceholder')}
            autocomplete="off"
          />
        </div>
        <div class="grid gap-2">
          <Label for="studio-pack-description">{text('PackDescription')}</Label>
          <Textarea
            id="studio-pack-description"
            data-id="studio-pack-description"
            bind:value={description}
            placeholder={text('PackDescriptionPlaceholder')}
            rows={2}
          />
        </div>
        <div class="grid gap-2">
          <Label for="studio-pack-industry">{text('PackIndustry')}</Label>
          <Input
            id="studio-pack-industry"
            data-id="studio-pack-industry"
            bind:value={industry}
            placeholder={text('PackIndustryPlaceholder')}
            autocomplete="off"
          />
        </div>
        <fieldset class="m-0 grid min-w-0 gap-2 border-0 p-0">
          <legend class="mb-2 text-sm font-medium">{text('ExportChooseTypes')}</legend>
          <div class="export-types">
            {#each choices as choice (choice.key)}
              <label class="export-type">
                <Checkbox
                  data-id={`studio-export-type-${choice.key}`}
                  checked={selected.includes(choice.key)}
                  onCheckedChange={(isChecked) => {
                    toggle(choice.key, isChecked)
                  }}
                />
                <span class="min-w-0 break-words">{choice.name}</span>
              </label>
            {/each}
          </div>
          {#if parents.length > 0}
            <p class="m-0 text-xs text-muted-foreground">
              {text('ExportAddsParents', { names: parents.map((it) => it.name).join(', ') })}
            </p>
          {/if}
        </fieldset>
        <Dialog.Footer>
          <Button variant="outline" onclick={onClose}>{text('Cancel')}</Button>
          <Button data-track="studio.pack_export.submit" type="submit" data-id="studio-export-pack-confirm" disabled={!canExport}>{text('ExportDownload')}</Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  .export-types {
    display: grid;
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid var(--theme-divider-color);
    border-radius: 8px;
  }
  .export-type {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 4px 12px;
    font-size: 13px;
    cursor: pointer;
  }
  .export-type + .export-type {
    border-top: 1px solid var(--theme-divider-color);
  }
  .export-type:hover {
    background: var(--theme-button-default);
  }
</style>
