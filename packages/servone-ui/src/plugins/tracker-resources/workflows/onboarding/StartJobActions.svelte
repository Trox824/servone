<script lang="ts">
  import { getName, type Employee } from '@hcengineering/contact'
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { Label } from '@hcengineering/ui'
  import { openDoc, statusStore } from '@hcengineering/view-resources'
  import { Ellipsis, UserPlus } from '@lucide/svelte'
  import { Button, buttonVariants } from '../../../../lib/components/ui/button'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import * as DropdownMenu from '../../../../lib/components/ui/dropdown-menu'
  import { jobAction, type JobAction, type JobKind } from './onboarding'
  import { jobIssueClass, type JobIssue } from './start-job'
  import StartJobDialog from './StartJobDialog.svelte'
  import { str } from './strings'

  export let person: Employee
  export let isInline = false
  let className = ''
  export { className as class }

  const isAdmin = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const closedCategories = [task.statusCategory.Won, task.statusCategory.Lost]

  interface TrackedJob {
    issue: JobIssue
    kind: JobKind
    isOpen: boolean
  }

  let jobIssues: JobIssue[] = []
  let heldSteps: JobIssue[] = []
  const jobsQuery = createQuery()
  const heldQuery = createQuery()
  $: if (isAdmin) {
    jobsQuery.query(jobIssueClass, { servoneJobPerson: person._id }, (found) => { jobIssues = found })
    heldQuery.query(jobIssueClass, { servoneHeldFor: person._id, assignee: null }, (found) => { heldSteps = found })
  }

  $: jobs = jobIssues.flatMap((issue): TrackedJob[] => {
    if (issue.servoneJobKind === undefined) return []
    const category = $statusStore.byId.get(issue.status)?.category
    return [{ issue, kind: issue.servoneJobKind, isOpen: category === undefined || !closedCategories.includes(category) }]
  })
  $: onboarding = jobAction('onboarding', jobs)
  $: offboarding = jobAction('offboarding', jobs)
  $: canStartOffboarding = offboarding.action === 'start' && person.active
  $: hasMenu = offboarding.action === 'open' || canStartOffboarding || heldSteps.length > 0
  $: personName = getName(hierarchy, person)

  function openJob (action: JobAction<TrackedJob>): void {
    if (action.action === 'open') void openDoc(hierarchy, action.job.issue)
  }

  async function release (step: JobIssue): Promise<void> {
    await client.update(step, { assignee: person._id })
  }

  let openKind: JobKind | undefined
  let isStarting = false
</script>

{#if isAdmin && (onboarding.action !== 'none' || hasMenu)}
  <div class="flex flex-wrap gap-2 {className}">
    {#if onboarding.action !== 'none'}
      <Button
        variant={isInline ? 'secondary' : 'outline'}
        size={isInline ? 'xs' : 'sm'}
        onclick={() => { if (onboarding.action === 'start') openKind = 'onboarding'; else openJob(onboarding) }}
      >
        <UserPlus class="text-muted-foreground" />
        <Label label={onboarding.action === 'start' ? str.StartOnboarding : str.OpenOnboarding} />
      </Button>
    {/if}
    {#if hasMenu}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger class={buttonVariants({ variant: isInline ? 'secondary' : 'outline', size: isInline ? 'icon-xs' : 'icon-sm' })}>
          <Ellipsis />
          <span class="sr-only"><Label label={str.More} /></span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="w-64">
          {#each heldSteps as step (step._id)}
            <DropdownMenu.Item onSelect={() => { void release(step) }}>
              <Label label={str.AssignHeld} params={{ step: step.title, person: personName }} />
            </DropdownMenu.Item>
          {/each}
          {#if offboarding.action === 'open'}
            <DropdownMenu.Item onSelect={() => { openJob(offboarding) }}>
              <Label label={str.OpenOffboarding} />
            </DropdownMenu.Item>
          {:else if canStartOffboarding}
            <DropdownMenu.Item onSelect={() => { openKind = 'offboarding' }}>
              <Label label={str.StartOffboarding} />
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </div>
{/if}

{#if isAdmin}
  <Dialog.Root open={openKind !== undefined} onOpenChange={(isOpen) => { if (!isOpen && !isStarting) openKind = undefined }}>
    {#if openKind !== undefined}
      <Dialog.Content class="top-[12vh] translate-y-0 gap-0 p-0 sm:max-w-md">
        <StartJobDialog {person} kind={openKind} bind:isStarting on:close={() => { openKind = undefined }} />
      </Dialog.Content>
    {/if}
  </Dialog.Root>
{/if}
