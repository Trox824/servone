<script lang="ts">
  import type { CardSpace } from '@hcengineering/card'
  import type { Ref, Space } from '@hcengineering/core'
  import { type Action, getCurrentLocation, navigate } from '@hcengineering/ui'
  import { TreeNode } from '@hcengineering/view-resources'
  import type { SpacesNavModel } from '@hcengineering/workbench'
  import { CHANGE_SPACE } from '@servone/config'

  export let space: CardSpace
  export let model: SpacesNavModel
  export let currentSpace: Ref<Space> | undefined
  export let forciblyСollapsed: boolean = false
  export let getActions: (space: Space) => Promise<Action[]> = async () => []

  const APP_PATH_DEPTH = 3

  function openSpace (): void {
    const loc = getCurrentLocation()
    loc.path = [...loc.path.slice(0, APP_PATH_DEPTH), space._id, 'type']
    navigate(loc)
  }
</script>

{#if space._id !== CHANGE_SPACE}
  <TreeNode
    _id={space._id}
    icon={model.icon}
    title={space.name}
    parent={false}
    isFold
    empty
    selected={currentSpace === space._id}
    {forciblyСollapsed}
    actions={async () => await getActions(space)}
    on:click={openSpace}
  />
{/if}
