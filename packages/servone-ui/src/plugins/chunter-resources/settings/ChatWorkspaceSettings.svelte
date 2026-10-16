<!-- Workspace settings > Chat. Mounted by the setting-resources WorkspaceSettings shadow. -->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import chunter from '@hcengineering/chunter'
  import { getClient } from '@hcengineering/presentation'
  import { Breadcrumb, Header, Label, Scroller, themeStore } from '@hcengineering/ui'
  import { translate } from '@hcengineering/platform'
  import * as Select from '../../../lib/components/ui/select'
  import { readCreatePolicy } from '../../../lib/chat/create-policy'
  import { roleCapabilitySettings, saveCreatePolicy } from './createPolicy'

  const CHAT = 'setting:string:ServoneChat' as IntlString
  const WHO_CAN_CREATE = 'setting:string:ServoneWhoCanCreateChannels' as IntlString

  const policyItems = [
    { id: 'everyone', label: 'setting:string:ServoneCreateEveryone' as IntlString },
    { id: 'admins', label: 'setting:string:ServoneCreateAdmins' as IntlString }
  ]

  const client = getClient()
  const capabilitySettings = roleCapabilitySettings()

  $: policy = readCreatePolicy($capabilitySettings?.roleByCapability)

  let titles: Record<string, string> = {}
  $: void Promise.all(
    [...policyItems, { id: WHO_CAN_CREATE, label: WHO_CAN_CREATE }].map(
      async (choice) => [choice.id, await translate(choice.label, {}, $themeStore.language)] as const
    )
  ).then((entries) => {
    titles = Object.fromEntries(entries)
  })

  function selectPolicy (id: string | number): void {
    const next = id === 'admins' ? 'admins' : 'everyone'
    if (next === policy) return
    void saveCreatePolicy(client, $capabilitySettings, next)
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={chunter.icon.Chunter} label={CHAT} size={'large'} isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-2xl flex-col px-6 py-6">
      <div class="flex items-center justify-between gap-4 border-b border-border py-3">
        <span class="text-sm text-foreground"><Label label={WHO_CAN_CREATE} /></span>
        <Select.Root type="single" value={policy} onValueChange={selectPolicy}>
          <Select.Trigger class="w-52" aria-label={titles[WHO_CAN_CREATE] ?? ''}>{titles[policy] ?? ''}</Select.Trigger>
          <Select.Content>
            {#each policyItems as choice (choice.id)}
              <Select.Item value={choice.id} label={titles[choice.id] ?? ''} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>
  </Scroller>
</div>
