<script lang="ts">
  import type { ActivityMessage } from '@hcengineering/activity'
  import type { Doc, Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import workbench from '@hcengineering/workbench'
  import { closeWidgetTab, minimizeSidebar, sidebarStore, SidebarVariant } from '@hcengineering/workbench-resources'

  import chunter from '../../plugin'
  import ThreadView from './ThreadView.svelte'

  export let scope: Ref<Doc> | undefined

  const chatWidget = getClient().getModel().findAllSync(workbench.class.Widget, { _id: chunter.ids.ChatWidget })[0]

  let thread: Ref<ActivityMessage> | undefined
  let threadTabId: string | undefined
  let openScope = scope

  $: if ($sidebarStore.variant === SidebarVariant.EXPANDED && $sidebarStore.widget === chunter.ids.ChatWidget) {
    const chatState = $sidebarStore.widgetsState.get(chunter.ids.ChatWidget)
    const activeTab = chatState?.tabs.find((tab) => tab.id === chatState?.tab)
    if (activeTab?.data?.thread !== undefined) {
      thread = activeTab.data.thread
      threadTabId = activeTab.id
    }
  }

  $: if (scope !== openScope) {
    if (openScope !== undefined) thread = undefined
    openScope = scope
  }

  function close (): void {
    thread = undefined
    minimizeSidebar()
    if (threadTabId !== undefined) void closeWidgetTab(chatWidget, threadTabId)
  }
</script>

{#if thread !== undefined}
  <div class="absolute inset-0 z-10 flex flex-col bg-background">
    <ThreadView _id={thread} on:close={close} on:channel={close} />
  </div>
{/if}
