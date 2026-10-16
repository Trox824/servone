<script lang="ts">
  import { getName } from '@hcengineering/contact'
  import { getPersonByPersonId } from '@hcengineering/contact-resources'
  import { translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { Label, navigate, themeStore } from '@hcengineering/ui'
  import { getObjectLinkFragment } from '@hcengineering/view-resources'
  import { Forward } from '@lucide/svelte'

  import { getChannelName } from '../utils'
  import type { ForwardedFrom } from './origin'
  import { forwardStrings } from './strings'

  export let origin: ForwardedFrom

  const client = getClient()

  let channelName: string | undefined
  let author = ''
  let isAccessible = false

  $: void loadChannel(origin)
  $: void loadAuthor(origin)

  async function loadChannel (from: ForwardedFrom): Promise<void> {
    const channel = await client.findOne(from.channelClass, { _id: from.channelId })
    isAccessible = channel !== undefined
    channelName =
      channel !== undefined
        ? await getChannelName(channel._id, channel._class, channel)
        : await translate(forwardStrings.PrivateConversation, {}, $themeStore.language)
  }

  async function loadAuthor (from: ForwardedFrom): Promise<void> {
    const person = await getPersonByPersonId(from.author)
    author = person !== null ? getName(client.getHierarchy(), person) : ''
  }

  async function openOriginal (): Promise<void> {
    const original = await client.findOne(origin.messageClass, { _id: origin.messageId })
    if (original === undefined) return
    navigate(await getObjectLinkFragment(client.getHierarchy(), original))
  }
</script>

<div class="mb-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
  <Forward size={12} class="shrink-0" />
  <span class="truncate">
    <Label label={forwardStrings.ForwardedFrom} params={{ channel: channelName ?? '', author }} />
  </span>
  {#if isAccessible}
    <button type="button" class="shrink-0 text-primary underline-offset-4 hover:underline" on:click={openOriginal}>
      <Label label={forwardStrings.ViewOriginal} />
    </button>
  {/if}
</div>
