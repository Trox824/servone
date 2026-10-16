<!-- Create / rename a sidebar section; closes with the cleaned name, or nothing on cancel. -->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import presentation from '@hcengineering/presentation'
  import { Modal, ModernEditbox } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { MAX_SECTION_NAME, parseSectionName } from '../../../lib/chat/sections'
  import { sectionString } from './store'

  export let label: IntlString
  export let name = ''

  const dispatch = createEventDispatcher()

  $: parsedName = parseSectionName(name)

  function save (): void {
    if (parsedName === undefined) return
    dispatch('close', parsedName)
  }
</script>

<Modal
  {label}
  type="type-popup"
  okLabel={presentation.string.Save}
  okAction={save}
  canSave={parsedName !== undefined}
  onCancel={() => dispatch('close')}
  on:close
>
  <ModernEditbox
    bind:value={name}
    label={sectionString.SectionName}
    limit={MAX_SECTION_NAME}
    size="large"
    kind="ghost"
    autoFocus
  />
</Modal>
