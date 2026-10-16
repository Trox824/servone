<script lang="ts">
  import contact, { getPersonRefByPersonIdCb, type Person } from '@hcengineering/contact'
  import core, { type PersonId, type Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { type IconSize, Label } from '@hcengineering/ui'
  import view from '../plugin'
  import ObjectPresenter from './ObjectPresenter.svelte'

  export let value: PersonId | undefined
  export let shouldShowName: boolean = true
  export let shouldShowAvatar: boolean = true
  export let noUnderline: boolean = false
  export let shrink: boolean = false
  export let avatarSize: IconSize = 'x-small'
  export let withPadding: boolean = true

  const client = getClient()

  let personRef: Ref<Person> | undefined
  let hasLookupAnswered = false

  $: lookupPerson(value)

  function lookupPerson (personId: PersonId | undefined): void {
    if (personId === undefined) {
      personRef = undefined
      hasLookupAnswered = false
      return
    }
    hasLookupAnswered = false
    getPersonRefByPersonIdCb(client, personId, (foundRef) => {
      if (personId !== value) return
      personRef = foundRef ?? undefined
      hasLookupAnswered = true
    })
  }

  $: fallbackLabel = value === core.account.System ? core.string.System : view.string.NotSpecified
</script>

{#if personRef !== undefined}
  <div class={withPadding ? 'block pl-3' : 'block'}>
    <ObjectPresenter
      objectId={personRef}
      _class={contact.class.Person}
      {shouldShowName}
      {shouldShowAvatar}
      {noUnderline}
      shrink={shrink ? 1 : 0}
      props={{ avatarSize }}
    />
  </div>
{:else if hasLookupAnswered && value !== undefined}
  <div class={withPadding ? 'block pl-3' : 'block'}>
    <span class="block truncate text-muted-foreground"><Label label={fallbackLabel} /></span>
  </div>
{/if}
