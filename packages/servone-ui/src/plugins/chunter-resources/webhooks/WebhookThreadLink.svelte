<script lang="ts">
  import type { ActivityMessage } from '@hcengineering/activity'
  import chunter from '@hcengineering/chunter'
  import type { IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { Label, navigate } from '@hcengineering/ui'
  import { getObjectLinkFragment } from '@hcengineering/view-resources'
  import { webhookThread } from './api'

  export let message: ActivityMessage | undefined

  const REPLIED_IN_THREAD = 'chunter:string:ServoneRepliedInThread' as IntlString
  const client = getClient()

  $: parentId = message !== undefined ? webhookThread(message) : undefined

  async function openParent (): Promise<void> {
    if (parentId === undefined) return
    const parent = await client.findOne(chunter.class.ChatMessage, { _id: parentId })
    if (parent === undefined) return
    navigate(await getObjectLinkFragment(client.getHierarchy(), parent))
  }
</script>

{#if parentId !== undefined}
  <button type="button" class="shrink-0 text-xs text-primary underline-offset-4 hover:underline" on:click={openParent}>
    <Label label={REPLIED_IN_THREAD} />
  </button>
{/if}
