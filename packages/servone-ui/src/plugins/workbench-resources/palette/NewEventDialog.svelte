<!-- Mounted on body by the Cmd+K palette (not showPopup: the popup overlay sits above shadcn dialogs).
     Same EventDialog setup as CalendarWidget and MeetingsApp. -->
<script lang="ts">
  import contact from '@hcengineering/contact'
  import type { PersonId } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { languageStore } from '@hcengineering/theme'
  import * as Dialog from '../../../lib/components/ui/dialog'
  import EventDialog from '../../calendar-resources/lich/components/EventDialog.svelte'
  import type { Lang } from '../../calendar-resources/lich/lib/types'

  export let meeting: boolean
  export let onClose: () => void

  $: lang = ($languageStore === 'vi' ? 'vi' : 'en') satisfies Lang

  let personToSocial = new Map<string, PersonId[]>()
  createQuery().query(contact.class.SocialIdentity, { attachedToClass: contact.class.Person }, (identities) => {
    const byPerson = new Map<string, PersonId[]>()
    for (const identity of identities) byPerson.set(identity.attachedTo, [...(byPerson.get(identity.attachedTo) ?? []), identity._id])
    personToSocial = byPerson
  })
</script>

<Dialog.Root open onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
  <Dialog.Content class="top-[8vh] translate-y-0 gap-0 p-0 sm:max-w-2xl">
    <EventDialog {meeting} {lang} stored={[]} {personToSocial} on:close={onClose} />
  </Dialog.Content>
</Dialog.Root>
