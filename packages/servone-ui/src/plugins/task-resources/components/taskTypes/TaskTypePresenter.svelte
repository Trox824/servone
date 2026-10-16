<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import type { TaskType } from '@hcengineering/task'
  import { getClient } from '@hcengineering/presentation'
  import { taskTypeStore } from '../../'
  import TaskTypeIcon from './TaskTypeIcon.svelte'

  export let value: TaskType | Ref<TaskType> | undefined

  const hierarchy = getClient().getHierarchy()

  $: taskType = typeof value === 'string' ? $taskTypeStore.get(value) : value
  $: taskClass = taskType?.ofClass !== undefined ? hierarchy.getClass(taskType.ofClass) : undefined
</script>

{#if taskType !== undefined && taskClass !== undefined}
  <span class="label ml-3 inline-flex items-center gap-1 whitespace-nowrap">
    <TaskTypeIcon value={taskType} size={'small'} />
    <span class={taskClass.icon !== undefined ? 'ml-1' : ''}>{taskType.name}</span>
  </span>
{/if}
