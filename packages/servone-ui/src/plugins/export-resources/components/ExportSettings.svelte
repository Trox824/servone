<script lang="ts">
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import { getMetadata, translate, type IntlString } from '@hcengineering/platform'
  import presentation, { MessageBox } from '@hcengineering/presentation'
  import { Breadcrumb, Header, Label, Scroller, showPopup, themeStore } from '@hcengineering/ui'
  import plugin from '../plugin'
  import { Button } from '../../../lib/components/ui/button'
  import * as Select from '../../../lib/components/ui/select'

  interface Choice {
    id: string
    label: IntlString
  }

  const dataChoices: Choice[] = [
    { id: 'tracker:class:Issue', label: plugin.string.ExportIssues },
    { id: 'tracker:class:Milestone', label: plugin.string.ExportMilestones },
    { id: 'document:class:Document', label: plugin.string.ExportDocuments }
  ]
  const formatChoices: Choice[] = [
    { id: 'json', label: plugin.string.ExportJSON },
    { id: 'csv', label: plugin.string.ExportCSV }
  ]
  const contentChoices: Choice[] = [
    { id: 'everything', label: plugin.string.ExportEverything },
    { id: 'attributesOnly', label: plugin.string.ExportAttributesOnly }
  ]
  const rows = [
    { title: plugin.string.DataToExport, choices: dataChoices },
    { title: plugin.string.ExportFormat, choices: formatChoices },
    { title: plugin.string.ExportIncludeContent, choices: contentChoices }
  ]

  let selectedData = dataChoices[0].id
  let selectedFormat = formatChoices[0].id
  let selectedContent = contentChoices[0].id
  $: selections = [selectedData, selectedFormat, selectedContent]

  let translated = new Map<string, string>()
  let busy = false

  $: void translateChoices($themeStore.language)

  async function translateChoices (language: string): Promise<void> {
    const all = [...dataChoices, ...formatChoices, ...contentChoices]
    const texts = await Promise.all(all.map(async (choice) => await translate(choice.label, {}, language)))
    if (language !== $themeStore.language) return
    translated = new Map(all.map((choice, index) => [choice.id, texts[index]]))
  }

  function updateSelection (rowIndex: number, id: string): void {
    if (rowIndex === 0) selectedData = id
    else if (rowIndex === 1) selectedFormat = id
    else selectedContent = id
  }

  function showOutcome (ok: boolean): void {
    showPopup(MessageBox, {
      label: ok ? plugin.string.ExportRequestSuccess : plugin.string.ExportRequestFailed,
      message: ok ? plugin.string.ExportRequestSuccessMessage : plugin.string.ExportRequestFailedMessage,
      kind: ok ? 'success' : 'error'
    })
  }

  async function requestExport (): Promise<void> {
    if (busy) return
    busy = true
    try {
      const baseUrl = getMetadata(plugin.metadata.ExportUrl) ?? ''
      const token = getMetadata(presentation.metadata.Token) ?? ''
      const response = await fetch(`${baseUrl}/exportAsync?format=${selectedFormat}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          _class: selectedData as Ref<Class<Doc>>,
          attributesOnly: selectedContent === 'attributesOnly',
          config: {}
        })
      })
      showOutcome(response.ok)
    } catch {
      showOutcome(false)
    } finally {
      busy = false
    }
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={plugin.icon.Export} label={plugin.string.Export} size={'large'} isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto w-full max-w-2xl p-6">
      {#each rows as row, rowIndex}
        <div class="flex items-center justify-between gap-4 border-b border-border py-3">
          <span class="text-sm text-foreground"><Label label={row.title} /></span>
          <Select.Root
            type="single"
            value={selections[rowIndex]}
            onValueChange={(id) => { updateSelection(rowIndex, id) }}
          >
            <Select.Trigger class="w-44">
              {translated.get(selections[rowIndex]) ?? ''}
            </Select.Trigger>
            <Select.Content>
              {#each row.choices as choice}
                <Select.Item value={choice.id} label={translated.get(choice.id) ?? ''} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {/each}
      <div class="flex justify-end pt-4">
        <Button disabled={busy} onclick={requestExport}><Label label={plugin.string.Export} /></Button>
      </div>
    </div>
  </Scroller>
</div>
