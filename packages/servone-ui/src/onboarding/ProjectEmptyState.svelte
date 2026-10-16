<script lang="ts">
  import type { Ref, Space } from '@hcengineering/core'
  import tracker from '@hcengineering/tracker'
  import { showPopup } from '@hcengineering/ui'
  import EmptyState from '../plugins/tracker-resources/workflows/components/EmptyState.svelte'
  import { emptyCopy } from './empty-copy'

  export let space: Ref<Space>

  function newTask (): void {
    showPopup(tracker.component.CreateIssue, { space, shouldSaveDraft: false }, 'top')
  }
</script>

<EmptyState label={emptyCopy.projects} isNarrowed={false} actionLabel={emptyCopy.projectsAction} onAction={newTask} />
