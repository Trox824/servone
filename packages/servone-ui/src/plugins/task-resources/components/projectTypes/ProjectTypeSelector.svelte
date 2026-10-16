<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task, { type ProjectType, type ProjectTypeDescriptor } from '@hcengineering/task'
  import { DropdownLabels, type ButtonKind, type ButtonSize, type DropdownTextItem } from '@hcengineering/ui'
  import { baseTypeOf } from '@servone/config'
  import { createEventDispatcher } from 'svelte'
  import { canSetUp, ensureScrumProjectType } from '../../../tracker-resources/sprints/setup'
  import { WORKFLOW_TYPE_ID } from '../../../tracker-resources/workflows/plugin'
  import plugin from '../../plugin'

  export let descriptors: Ref<ProjectTypeDescriptor>[]
  export let type: Ref<ProjectType> | undefined = undefined
  export let kind: ButtonKind = 'no-border'
  export let size: ButtonSize = 'small'
  export let focusIndex: number = -1
  export let disabled: boolean = false

  const dispatch = createEventDispatcher()
  const query = createQuery()

  let items: DropdownTextItem[] = []
  let selected: string | undefined = type

  if (canSetUp()) void ensureScrumProjectType(getClient())

  query.query(task.class.ProjectType, { descriptor: { $in: descriptors } }, (types) => {
    items = types
      .filter((projectType) => baseTypeOf(projectType._id) === projectType._id && projectType._id !== WORKFLOW_TYPE_ID)
      .map((projectType) => ({ id: projectType._id, label: projectType.name }))
  })

  function applySelection (id: string | undefined): void {
    type = id as Ref<ProjectType> | undefined
    dispatch('change', type)
  }

  $: applySelection(selected)
</script>

<DropdownLabels
  {items}
  {focusIndex}
  {kind}
  {size}
  {disabled}
  icon={task.icon.ManageTemplates}
  label={plugin.string.States}
  bind:selected
/>
