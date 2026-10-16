<script lang="ts">
  import type { Channel } from '@hcengineering/chunter'
  import core, { AccountRole, type AccountUuid, notEmpty, setWorkspaceGuestAutoJoinRoles } from '@hcengineering/core'
  import { AccountArrayEditor, employeeRefByAccountUuidStore } from '@hcengineering/contact-resources'
  import type { IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { DropdownLabelsIntl, Label } from '@hcengineering/ui'
  import { Archive } from '@lucide/svelte'
  import { Button } from '../../../lib/components/ui/button'
  import { Switch } from '../../../lib/components/ui/switch'
  import { createEventDispatcher } from 'svelte'
  import { isGuestAccessEnabled } from '../guest-access'
  import { ArchiveChannel } from '../index'
  import chunter from '../plugin'
  import AutoJoinedBy from '../departmentChannels/AutoJoinedBy.svelte'
  import { askBackfillAutoJoin } from '../departmentChannels/backfill'
  import { canEditChannel, canManage, canSetOwners } from '../announce/policy'
  import { announceSettings, type AnnounceSettings } from '../announce/schema'
  import { currentActor, saveAnnounceSettings, saveChannelOwners } from '../announce/setup'
  import WebhooksSection from '../webhooks/WebhooksSection.svelte'
  import ChatHooksSection from '../chat-hooks/ChatHooksSection.svelte'
  import { intl } from '../../../lib/intl'

  export let channel: Channel

  const dispatch = createEventDispatcher()
  const client = getClient()
  const actor = currentActor()

  const accessHeading = 'chunter:string:ServoneChannelAccess' as IntlString
  const guestAutoJoinLabel = 'chunter:string:ServoneAutoJoinGuests' as IntlString
  const guestAutoJoinHint = 'chunter:string:ServoneAutoJoinGuestsHint' as IntlString
  const whoCanPostLabel = 'chunter:string:ServoneWhoCanPost' as IntlString
  const threadRepliesLabel = 'chunter:string:ServoneThreadReplies' as IntlString
  const channelOwnersLabel = 'chunter:string:ServoneChannelOwners' as IntlString
  const webhooksHeading = 'chunter:string:ServoneChannelWebhooks' as IntlString
  const autoJoinText = intl(core.string.AutoJoin)
  const guestAutoJoinText = intl(guestAutoJoinLabel)
  const threadRepliesText = intl(threadRepliesLabel)
  const postPolicyOptions = [
    { id: 'everyone', label: 'chunter:string:ServonePostEveryone' as IntlString },
    { id: 'admins', label: 'chunter:string:ServonePostAdmins' as IntlString }
  ]

  let isAutoJoinOn = channel?.autoJoin ?? false
  let autoJoinRoles: AccountRole[] =
    channel?.autoJoinForRoles !== undefined ? client.getHierarchy().clone(channel.autoJoinForRoles) : []
  let isGuestAccessOn = false
  let ownersEditorRevision = 0

  void isGuestAccessEnabled().then((isEnabled) => {
    isGuestAccessOn = isEnabled
  })

  $: owners = channel?.owners ?? []
  $: isManager = canManage(actor, owners)
  $: canEdit = channel !== undefined && canEditChannel(channel, actor)
  $: settings = channel !== undefined ? announceSettings(channel) : undefined
  $: hasGuestRole = autoJoinRoles.includes(AccountRole.Guest)
  $: memberPersons = (channel?.members ?? [])
    .map((member) => $employeeRefByAccountUuidStore.get(member))
    .filter(notEmpty)

  function persistAutoJoin (): void {
    void client.diffUpdate(channel, {
      autoJoin: isAutoJoinOn,
      autoJoinForRoles: autoJoinRoles.length > 0 ? [...autoJoinRoles] : undefined
    })
  }

  function handleAutoJoinChange (isChecked: boolean): void {
    isAutoJoinOn = isChecked
    persistAutoJoin()
    if (isChecked) askBackfillAutoJoin(channel)
  }

  function handleGuestAutoJoinChange (isChecked: boolean): void {
    autoJoinRoles = setWorkspaceGuestAutoJoinRoles(autoJoinRoles, isChecked)
    persistAutoJoin()
  }

  function handlePostPolicySelected (event: CustomEvent<string | number>): void {
    if (settings === undefined) return
    const nextPolicy: AnnounceSettings['postPolicy'] = event.detail === 'admins' ? 'admins' : 'everyone'
    if (nextPolicy === settings.postPolicy) return
    void saveAnnounceSettings(client, channel, { postPolicy: nextPolicy, threadReplies: settings.threadReplies })
  }

  function handleThreadRepliesChange (isChecked: boolean): void {
    if (settings === undefined) return
    void saveAnnounceSettings(client, channel, { postPolicy: settings.postPolicy, threadReplies: isChecked })
  }

  function handleOwnersChange (nextOwners: AccountUuid[]): void {
    if (!canSetOwners(actor, owners, nextOwners)) {
      ownersEditorRevision += 1
      return
    }
    void saveChannelOwners(client, channel, nextOwners)
  }

  function archiveCurrentChannel (event: MouseEvent): void {
    void ArchiveChannel(channel, event, { afterArchive: () => dispatch('close') })
  }
</script>

{#if channel}
  <section class="channel-aside__section">
    <h3 class="channel-aside__heading"><Label label={accessHeading} /></h3>

    <div class="setting-row">
      <div class="setting-text">
        <span><Label label={core.string.AutoJoin} /></span>
        <span class="hint"><Label label={core.string.AutoJoinDescr} /></span>
        <span class="hint"><AutoJoinedBy {channel} /></span>
      </div>
      <Switch
        bind:checked={isAutoJoinOn}
        disabled={!isManager}
        data-id="channel-auto-join-toggle"
        aria-label={$autoJoinText}
        onCheckedChange={handleAutoJoinChange}
      />
    </div>

    {#if isGuestAccessOn || hasGuestRole}
      <div class="setting-row">
        <div class="setting-text">
          <span><Label label={guestAutoJoinLabel} /></span>
          <span class="hint"><Label label={guestAutoJoinHint} /></span>
        </div>
        <Switch
          checked={hasGuestRole}
          disabled={!isManager}
          data-id="channel-guest-auto-join-toggle"
          aria-label={$guestAutoJoinText}
          onCheckedChange={handleGuestAutoJoinChange}
        />
      </div>
    {/if}

    {#if settings !== undefined}
      <div class="setting-row">
        <div class="setting-text"><span><Label label={whoCanPostLabel} /></span></div>
        <DropdownLabelsIntl
          dataId="channel-post-policy"
          items={postPolicyOptions}
          selected={settings.postPolicy}
          label={whoCanPostLabel}
          kind="ghost"
          width="10rem"
          disabled={!isManager}
          on:selected={handlePostPolicySelected}
        />
      </div>

      {#if settings.postPolicy === 'admins'}
        <div class="setting-row">
          <div class="setting-text"><span><Label label={threadRepliesLabel} /></span></div>
          <Switch
            checked={settings.threadReplies}
            disabled={!isManager}
            data-id="channel-thread-replies-toggle"
            aria-label={$threadRepliesText}
            onCheckedChange={handleThreadRepliesChange}
          />
        </div>
      {/if}
    {/if}

    <div class="setting-row">
      <div class="setting-text"><span><Label label={channelOwnersLabel} /></span></div>
      {#key ownersEditorRevision}
        <AccountArrayEditor
          label={channelOwnersLabel}
          value={owners}
          includeItems={memberPersons}
          readonly={!isManager}
          kind="ghost"
          size="medium"
          onChange={handleOwnersChange}
        />
      {/key}
    </div>
  </section>

  {#if isManager}
    <section class="channel-aside__section">
      <h3 class="channel-aside__heading"><Label label={webhooksHeading} /></h3>
      <WebhooksSection {channel} />
      <ChatHooksSection {channel} />
    </section>
  {/if}

  {#if canEdit}
    <section class="channel-aside__section">
      <Button variant="destructive" size="sm" onclick={archiveCurrentChannel}>
        <Archive aria-hidden="true" />
        <Label label={chunter.string.ArchiveChannel} />
      </Button>
    </section>
  {/if}
{/if}

<style>
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 2rem;
  }

  .setting-text {
    display: grid;
    gap: 2px;
    min-width: 0;
    font-size: 13px;
    color: var(--theme-caption-color);
  }

  .hint {
    font-size: 12px;
    color: var(--theme-dark-color);
  }

  .hint :global(.text-sm) {
    font-size: inherit;
  }
</style>
