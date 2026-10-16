<script lang="ts">
  import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
  import type { Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import { Mail, UserPlus, X } from '@lucide/svelte'
  import * as Popover from '../../../../../lib/components/ui/popover'
  import * as Command from '../../../../../lib/components/ui/command'
  import * as Avatar from '../../../../../lib/components/ui/avatar'
  import { Badge } from '../../../../../lib/components/ui/badge'
  import { Button, buttonVariants } from '../../../../../lib/components/ui/button'
  import { cn } from '../../../../../lib/utils'
  import type { Answer } from '../../lib/rsvp'
  import type { Lang } from '../../lib/types'
  import { textOf } from '../../strings'
  import { copyFor } from './copy'
  import PersonAvatar from '../PersonAvatar.svelte'
  import { ANSWER_MARK } from '../answer-mark'

  export let id: string
  export let participants: Array<Ref<Person>>
  export let externalParticipants: string[]
  export let me: Ref<Person>
  export let lang: Lang
  export let disabled = false
  export let answers: Map<string, Answer> = new Map()
  export let organizer: string | undefined = undefined

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  let open = false
  let query = ''
  let employees: Employee[] = []
  createQuery().query(contact.mixin.Employee, { active: true }, (found) => {
    employees = found.filter((p) => p._id !== me)
  })

  function toggle (person: Ref<Person>): void {
    participants = participants.includes(person) ? participants.filter((p) => p !== person) : [...participants, person]
    query = ''
  }

  function invite (email: string): void {
    if (!externalParticipants.includes(email)) externalParticipants = [...externalParticipants, email]
    query = ''
  }

  $: t = copyFor(lang)
  $: text = textOf(lang)
  $: people = getPersonByPersonRefStore(participants)
  $: nameOf = (person: Ref<Person>): string => {
    const found = $people.get(person) ?? employees.find((e) => e._id === person)
    return found === undefined ? '' : formatName(found.name)
  }
  $: typedEmail = query.trim().toLowerCase()
  $: canInvite = EMAIL.test(typedEmail) && !externalParticipants.includes(typedEmail)
  $: isOnlyMe = externalParticipants.length === 0 && participants.every((p) => p === me)
</script>

<div class="grid gap-2">
  {#if !disabled}
    <Popover.Root bind:open>
      <Popover.Trigger {id} class={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-start bg-transparent font-normal text-muted-foreground')}>
        <UserPlus />
        {t('addGuests')}
      </Popover.Trigger>
      <Popover.Content class="w-(--bits-popover-anchor-width) min-w-72 p-0" align="start">
        <Command.Root>
          <Command.Input bind:value={query} placeholder={t('searchPeople')} />
          <Command.List class="max-h-64">
            <Command.Empty>{t('noPeople')}</Command.Empty>
            {#if canInvite}
              <Command.Group>
                <Command.Item value="invite:{typedEmail}" keywords={[typedEmail]} onSelect={() => { invite(typedEmail) }}>
                  <Mail />
                  {t('invite', { email: typedEmail })}
                </Command.Item>
              </Command.Group>
            {/if}
            <Command.Group heading={t('people')}>
              {#each employees as employee (employee._id)}
                <Command.Item
                  value={employee._id}
                  keywords={[formatName(employee.name)]}
                  data-checked={participants.includes(employee._id) ? 'true' : 'false'}
                  onSelect={() => { toggle(employee._id) }}
                >
                  <PersonAvatar person={employee._id} />
                  <span class="truncate">{formatName(employee.name)}</span>
                </Command.Item>
              {/each}
            </Command.Group>
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
  {/if}
  {#if !isOnlyMe}
    <ul class="m-0 list-none p-0 grid gap-0.5" aria-label={t('guests')}>
      {#each participants as person (person)}
        {@const answer = answers.get(person) ?? 'none'}
        {@const mark = ANSWER_MARK[answer]}
        <li class="flex h-9 items-center gap-2 rounded-lg px-1">
          <div class="relative shrink-0">
            <PersonAvatar {person} />
            <!-- An unsaved event has no replies yet, so it shows no marks. -->
            {#if answer !== 'none'}
              <svelte:component
                this={mark.icon}
                class="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-popover {mark.tone}"
                aria-label={text(mark.label)}
              />
            {/if}
          </div>
          <span class="grid min-w-0 flex-1">
            <span class="truncate text-sm {answer === 'declined' ? 'text-muted-foreground line-through' : ''}">{nameOf(person)}</span>
            {#if person === organizer}<span class="truncate text-xs text-muted-foreground">{text('Organizer')}</span>{/if}
          </span>
          {#if person === me}
            <Badge variant="outline">{t('you')}</Badge>
          {:else if !disabled}
            <Button variant="ghost" size="icon-xs" aria-label={t('remove', { name: nameOf(person) })} onclick={() => { toggle(person) }}>
              <X />
            </Button>
          {/if}
        </li>
      {/each}
      {#each externalParticipants as email (email)}
        <li class="flex h-9 items-center gap-2 rounded-lg px-1">
          <Avatar.Root size="sm">
            <Avatar.Fallback><Mail class="size-3" /></Avatar.Fallback>
          </Avatar.Root>
          <span class="min-w-0 flex-1 truncate text-sm">{email}</span>
          {#if !disabled}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('remove', { name: email })}
              onclick={() => { externalParticipants = externalParticipants.filter((e) => e !== email) }}
            >
              <X />
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
