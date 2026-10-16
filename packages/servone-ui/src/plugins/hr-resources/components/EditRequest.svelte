<script lang="ts">
  import core from '@hcengineering/core'
  import hr, { type Request, type TzDate } from '@hcengineering/hr'
  import { languageStore } from '@hcengineering/theme'
  import { getClient } from '@hcengineering/presentation'
  import { StyledTextArea } from '@hcengineering/text-editor-resources'
  import { createFocusManager, FocusHandler } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'
  import ApprovalBlock from '../../request-resources/components/ApprovalBlock.svelte'
  import { dateShort } from '../../calendar-resources/lich/lib/format'
  import { textOf, type StringKey } from '../../calendar-resources/lich/strings'

  export let object: Request

  const dispatch = createEventDispatcher()
  const manager = createFocusManager()

  onMount(() => {
    dispatch('open', { ignoreKeys: ['comments', 'description'] })
  })

  function localMidnight (date: TzDate): number {
    return new Date(date.year, date.month, date.day).getTime()
  }

  function leaveKey (type: Request['type']): StringKey {
    if (type === hr.ids.Vacation) return 'LeaveVacation'
    if (type === hr.ids.Sick) return 'LeaveSick'
    if (type === hr.ids.PTO) return 'LeavePTO'
    return 'LeaveRequest'
  }

  function buildHeading (request: Request, lang: 'vi' | 'en'): string {
    const typeName = textOf(lang)(leaveKey(request.type))
    const from = dateShort(localMidnight(request.tzDate), lang)
    const to = dateShort(localMidnight(request.tzDueDate), lang)
    return from === to ? `${typeName} · ${from}` : `${typeName} · ${from} – ${to}`
  }

  function saveDescription (): void {
    void getClient().update(object, { description: object.description })
  }

  $: lang = $languageStore === 'vi' ? ('vi' as const) : ('en' as const)
  $: heading = object !== undefined ? buildHeading(object, lang) : ''
</script>

{#if object !== undefined}
  <FocusHandler {manager} />
  <h1 class="mt-0 mb-3 text-2xl font-semibold">{heading}</h1>
  <ApprovalBlock {object} />
  <div class="flex-row-stretch flex-grow">
    <StyledTextArea
      bind:content={object.description}
      placeholder={core.string.Description}
      showButtons={false}
      on:value={saveDescription}
    />
  </div>
{/if}
