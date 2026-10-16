<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { IntlString } from '@hcengineering/platform'
  import { Label, Modal } from '@hcengineering/ui'
  import presentation, { getClient } from '@hcengineering/presentation'
  import core, { AccountRole, getCurrentAccount, setWorkspaceGuestAutoJoinRoles } from '@hcengineering/core'
  import contact, { getCurrentEmployee } from '@hcengineering/contact'
  import { Input } from '../../../../../lib/components/ui/input'
  import { Label as FieldLabel } from '../../../../../lib/components/ui/label'
  import { Switch } from '../../../../../lib/components/ui/switch'
  import { Textarea } from '../../../../../lib/components/ui/textarea'
  import { isGuestAccessEnabled } from '../../../guest-access'
  import chunter from '../../../plugin'
  import { openChannel } from '../../../navigation'
  import { canCreateChannel } from '../../../../../lib/chat/create-policy'
  import { ADMINS_ONLY_NOTICE, roleCapabilitySettings } from '../../../settings/createPolicy'
  import { intl } from '../../../../../lib/intl'

  const PRIVATE_HINT = 'chunter:string:ServonePrivateChannelHint' as IntlString
  const GUESTS_TITLE = 'chunter:string:ServoneAutoJoinGuests' as IntlString
  const GUESTS_HINT = 'chunter:string:ServoneAutoJoinGuestsHint' as IntlString
  const privateText = intl(chunter.string.Private)
  const autoJoinText = intl(core.string.AutoJoin)
  const guestsText = intl(GUESTS_TITLE)

  const dispatch = createEventDispatcher()
  const client = getClient()
  const capabilitySettings = roleCapabilitySettings()

  let channelName = ''
  let channelTopic = ''
  let isPrivateChannel = false
  let isAutoJoin = false
  let autoJoinRoles: AccountRole[] = []
  let isGuestAccessOn = false

  void isGuestAccessEnabled().then((isEnabled) => {
    isGuestAccessOn = isEnabled
  })

  $: isCreationAllowed = canCreateChannel(getCurrentAccount(), $capabilitySettings?.roleByCapability)
  $: canSave = channelName.trim().length > 0 && isCreationAllowed
  $: isGuestAutoJoin = autoJoinRoles.includes(AccountRole.Guest)

  function toggleGuestAutoJoin (isChecked: boolean): void {
    autoJoinRoles = setWorkspaceGuestAutoJoinRoles(autoJoinRoles, isChecked)
  }

  async function createChannel (): Promise<void> {
    if (!isCreationAllowed) return

    const personSpace = await client.findOne(
      contact.class.PersonSpace,
      { person: getCurrentEmployee() },
      { projection: { _id: 1 } }
    )
    if (personSpace === undefined) return

    const creatorUuid = getCurrentAccount().uuid
    const channelId = await client.createDoc(chunter.class.Channel, core.space.Space, {
      name: channelName,
      description: '',
      private: isPrivateChannel,
      archived: false,
      members: [creatorUuid],
      topic: channelTopic,
      owners: [creatorUuid],
      autoJoin: isAutoJoin,
      autoJoinForRoles: autoJoinRoles.length > 0 ? [...autoJoinRoles] : undefined
    })

    openChannel(channelId, chunter.class.Channel)
  }
</script>

<Modal
  label={chunter.string.NewChannel}
  type="type-popup"
  okLabel={presentation.string.Create}
  okAction={createChannel}
  {canSave}
  onCancel={() => dispatch('close')}
  on:close
>
  {#if !isCreationAllowed}
    <div class="content-dark-color px-2 pb-2 text-sm">
      <Label label={ADMINS_ONLY_NOTICE} />
    </div>
  {/if}

  <div class="grid gap-4 px-2 pb-2">
    <div class="grid gap-1.5">
      <FieldLabel for="new-channel-name"><Label label={chunter.string.ChannelName} /></FieldLabel>
      <Input id="new-channel-name" bind:value={channelName} autofocus />
    </div>

    <div class="grid gap-1.5">
      <FieldLabel for="new-channel-topic"><Label label={chunter.string.TopicOptional} /></FieldLabel>
      <Textarea id="new-channel-topic" rows={2} bind:value={channelTopic} />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div class="grid gap-0.5 text-sm">
        <span class="font-medium"><Label label={chunter.string.Private} /></span>
        <span class="text-xs text-muted-foreground"><Label label={PRIVATE_HINT} /></span>
      </div>
      <Switch data-id="channel-private-toggle" aria-label={$privateText} bind:checked={isPrivateChannel} />
    </div>

    <div class="flex items-center justify-between gap-4">
      <div class="grid gap-0.5 text-sm">
        <span class="font-medium"><Label label={core.string.AutoJoin} /></span>
        <span class="text-xs text-muted-foreground"><Label label={core.string.AutoJoinDescr} /></span>
      </div>
      <Switch data-id="channel-auto-join-toggle" aria-label={$autoJoinText} bind:checked={isAutoJoin} />
    </div>

    {#if isGuestAccessOn}
      <div class="flex items-center justify-between gap-4">
        <div class="grid gap-0.5 text-sm">
          <span class="font-medium"><Label label={GUESTS_TITLE} /></span>
          <span class="text-xs text-muted-foreground"><Label label={GUESTS_HINT} /></span>
        </div>
        <Switch
          data-id="channel-guest-auto-join-toggle"
          aria-label={$guestsText}
          checked={isGuestAutoJoin}
          onCheckedChange={toggleGuestAutoJoin}
        />
      </div>
    {/if}
  </div>
</Modal>
