<!--
// Copyright © 2023 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { SortingOrder } from '@hcengineering/core'
  import { Teamspace } from '@hcengineering/document'
  import { IconWithEmoji, getClient } from '@hcengineering/presentation'
  import { Icon, getPlatformColorDef, getPlatformColorForTextDef, navigate, themeStore } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { openDoc } from '@hcengineering/view-resources'
  import document from '../../plugin'
  import { getDocumentLink } from '../../utils'

  export let value: Teamspace | undefined
  export let inline: boolean = false
  export let accent: boolean = false
  export let noCursor: boolean = false

  let isRow = false
  const trackRow = (node: HTMLElement): void => {
    isRow = node.closest('.antiTable') !== null
  }

  async function open (): Promise<void> {
    if (value === undefined) return
    const client = getClient()
    const first = await client.findOne(
      document.class.Document,
      { space: value._id, parent: document.ids.NoParent },
      { sort: { rank: SortingOrder.Ascending } }
    )
    if (first === undefined) await openDoc(client.getHierarchy(), value)
    else navigate(getDocumentLink(first))
  }
</script>

{#if value}
  <div
    class="flex-presenter"
    class:cursor-default={!isRow}
    class:cursor-pointer={isRow}
    class:inline-presenter={inline}
    class:no-pointer={noCursor}
    data-space-row={isRow ? '' : undefined}
    role={isRow ? 'link' : undefined}
    tabindex={isRow ? 0 : undefined}
    use:trackRow
    on:click={isRow ? open : undefined}
    on:keydown={(event) => { if (isRow && event.key === 'Enter') void open() }}
  >
    <div class="icon" class:emoji={value.icon === view.ids.IconWithEmoji}>
      <Icon
        icon={value.icon === view.ids.IconWithEmoji ? IconWithEmoji : (value.icon ?? document.icon.Teamspace)}
        iconProps={value.icon === view.ids.IconWithEmoji
          ? { icon: value.color }
          : {
              fill:
                value.color !== undefined && typeof value.color !== 'string'
                  ? getPlatformColorDef(value.color, $themeStore.dark).icon
                  : getPlatformColorForTextDef(value.name, $themeStore.dark).icon
            }}
        size="small"
      />
    </div>
    <span class="label no-underline nowrap" class:fs-bold={accent}>
      {value.name}
    </span>
  </div>
{/if}
