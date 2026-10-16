<script context="module" lang="ts">
  import { Box, Car, DoorOpen, Projector } from '@lucide/svelte'
  import type { ResourceType } from '@servone/approvals/src/booking'

  export const ICONS: Record<ResourceType, typeof DoorOpen> = { room: DoorOpen, car: Car, equipment: Projector, other: Box }
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import { Archive, ArchiveRestore, ChevronRight, Pencil, Plus } from '@lucide/svelte'
  import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
  import type { Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { RESOURCE_CLASS, RESOURCE_TYPES, type BookableResource } from '@servone/approvals/src/booking'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Button } from '../../../../lib/components/ui/button'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import { Input } from '../../../../lib/components/ui/input'
  import { Label } from '../../../../lib/components/ui/label'
  import * as Select from '../../../../lib/components/ui/select'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'
  import { Switch } from '../../../../lib/components/ui/switch'
  import { teamDirectory, withoutBots } from '../../../../lib/team-departments'
  import { ensureResourceClass } from '../setup'
  import type { Lang } from '../lib/types'
  import { addSampleResources, createResource, setResourceArchived, updateResource, type ResourceFields } from './api'
  import { resourceTextOf } from './strings'

  export let lang: Lang

  const MANAGER = 'manager'

  const client = getClient()
  const directory = teamDirectory()
  let resources: BookableResource[] = []
  let isLoaded = false
  const resourcesQuery = createQuery()
  onMount(() => {
    void ensureResourceClass(client).then(() => {
      resourcesQuery.query(RESOURCE_CLASS, {}, (found) => {
        resources = found.sort((a, b) => a.name.localeCompare(b.name, lang))
        isLoaded = true
      })
    })
  })
  let employees: Employee[] = []
  createQuery().query(contact.mixin.Employee, { active: true }, (found) => { employees = found })

  $: t = resourceTextOf(lang)
  $: people = withoutBots(employees, $directory.bots).sort((a, b) => formatName(a.name).localeCompare(formatName(b.name), lang))
  $: nameOf = (person: Ref<Person> | undefined): string | undefined => {
    const found = people.find((employee) => employee._id === person)
    return found === undefined ? undefined : formatName(found.name)
  }
  $: active = resources.filter((resource) => !resource.archived)
  $: archived = resources.filter((resource) => resource.archived)
  let isArchivedShown = false

  let isFormOpen = false
  let editing: BookableResource | undefined
  let name = ''
  let type: ResourceType = 'room'
  let capacityText = ''
  let needsApproval = false
  let approver: Ref<Person> | undefined
  let isSaving = false
  let isSaveFailed = false

  $: capacity = capacityText.trim() === '' ? undefined : Number(capacityText)
  $: isCapacityValid = capacity === undefined || (Number.isInteger(capacity) && capacity > 0)
  $: canSave = name.trim() !== '' && isCapacityValid && !isSaving

  export function openForm (resource?: BookableResource): void {
    editing = resource
    name = resource?.name ?? ''
    type = resource?.type ?? 'room'
    capacityText = resource?.capacity === undefined ? '' : String(resource.capacity)
    needsApproval = resource?.needsApproval ?? false
    approver = resource?.approver
    isSaveFailed = false
    isFormOpen = true
  }

  function pickType (picked: string): void {
    const known = RESOURCE_TYPES.find((it) => it === picked)
    if (known !== undefined) type = known
  }

  async function run (write: () => Promise<void>): Promise<void> {
    if (isSaving) return
    isSaving = true
    isSaveFailed = false
    try {
      await write()
      isFormOpen = false
    } catch (err) {
      isSaveFailed = true
      throw err
    } finally {
      isSaving = false
    }
  }

  async function save (): Promise<void> {
    if (!canSave) return
    const fields: ResourceFields = { name: name.trim(), type, capacity, needsApproval, approver: needsApproval ? approver : undefined }
    const target = editing
    await run(async () => { await (target === undefined ? createResource(client, fields) : updateResource(client, target, fields)) })
  }
</script>

<!-- Lives inside the Quản lý tài nguyên dialog, so it supplies that dialog's title and description. -->
<div class="grid gap-4">
  <div class="flex items-start justify-between gap-3 pr-8">
    <div class="grid gap-1">
      <Dialog.Title class="text-lg font-semibold">{t('Manage')}</Dialog.Title>
      <Dialog.Description class="m-0 text-sm text-muted-foreground">{t('Intro')}</Dialog.Description>
    </div>
    {#if active.length > 0}
      <Button variant="outline" size="sm" class="shrink-0" onclick={() => { openForm() }}><Plus />{t('Add')}</Button>
    {/if}
  </div>
  <div class="grid gap-3">
    {#if !isLoaded}
      {#each [0, 1, 2] as row (row)}<Skeleton class="h-10 w-full" />{/each}
    {:else if active.length === 0}
      <div class="grid justify-items-start gap-3 rounded-lg border border-dashed border-border p-4">
        <div class="grid gap-1">
          <p class="m-0 text-sm font-medium">{t('Empty')}</p>
          <p class="m-0 text-sm text-muted-foreground">{t('EmptyHint')}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" disabled={isSaving} onclick={() => { void run(async () => { await addSampleResources(client, resources) }) }} title={t('SamplesHint')}>{t('UseSamples')}</Button>
          <Button variant="outline" size="sm" onclick={() => { openForm() }}><Plus />{t('Add')}</Button>
        </div>
        {#if isSaveFailed && !isFormOpen}
          <p class="m-0 text-sm text-destructive" role="alert">{t('SaveFailed')}</p>
        {/if}
      </div>
    {:else}
      <ul class="m-0 grid list-none divide-y divide-border rounded-lg border border-border p-0">
        {#each active as resource (resource._id)}
          {@const approverName = nameOf(resource.approver)}
          <li class="flex min-h-12 items-center gap-3 px-3 py-2">
            <svelte:component this={ICONS[resource.type]} class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div class="grid min-w-0 flex-1 gap-0.5">
              <span class="truncate text-sm font-medium">{resource.name}</span>
              <span class="truncate text-xs text-muted-foreground">
                {t(resource.type)}{#if resource.capacity !== undefined} · {t('People', { count: resource.capacity })}{/if}{#if resource.needsApproval && approverName !== undefined} · {t('ApprovedBy', { name: approverName })}{/if}
              </span>
            </div>
            {#if resource.needsApproval}
              <Badge variant="secondary" class="shrink-0">{t('NeedsApproval')}</Badge>
            {/if}
            <Button variant="ghost" size="icon-sm" class="text-muted-foreground" aria-label={t('Edit', { name: resource.name })} title={t('Edit', { name: resource.name })} onclick={() => { openForm(resource) }}>
              <Pencil class="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" class="text-muted-foreground" aria-label={t('Archive', { name: resource.name })} title={t('Archive', { name: resource.name })} onclick={() => { void setResourceArchived(client, resource, true) }}>
              <Archive class="size-3.5" />
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if archived.length > 0}
      <div class="grid gap-2">
        <Button variant="ghost" size="sm" class="justify-start px-1 text-muted-foreground" aria-expanded={isArchivedShown} onclick={() => { isArchivedShown = !isArchivedShown }}>
          <ChevronRight class="transition-transform {isArchivedShown ? 'rotate-90' : ''}" />{t('Archived', { count: archived.length })}
        </Button>
        {#if isArchivedShown}
          <p class="m-0 px-1 text-xs text-muted-foreground">{t('ArchivedHint')}</p>
          <ul class="m-0 grid list-none divide-y divide-border rounded-lg border border-border p-0">
            {#each archived as resource (resource._id)}
              <li class="flex min-h-10 items-center gap-3 px-3 py-1.5 text-muted-foreground">
                <svelte:component this={ICONS[resource.type]} class="size-4 shrink-0" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate text-sm">{resource.name}</span>
                <Button variant="ghost" size="sm" onclick={() => { void setResourceArchived(client, resource, false) }}><ArchiveRestore />{t('Restore')}</Button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
</div>

<Dialog.Root open={isFormOpen} onOpenChange={(next) => { isFormOpen = next }}>
  {#if isFormOpen}
    <Dialog.Content class="top-[12vh] max-h-[80vh] translate-y-0 gap-0 overflow-y-auto p-0 sm:max-w-md">
      <form class="flex flex-col" on:submit|preventDefault={() => { void save() }}>
        <div class="grid gap-5 px-6 pb-5 pt-6">
          <Dialog.Title class="pr-8 text-lg font-semibold">{editing === undefined ? t('AddTitle') : t('EditTitle')}</Dialog.Title>

          <div class="grid gap-1.5">
            <Label for="lich-resource-name">{t('Name')}</Label>
            <Input id="lich-resource-name" bind:value={name} placeholder={t('NamePlaceholder')} autocomplete="off" required />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="grid min-w-0 gap-1.5">
              <Label for="lich-resource-type">{t('Type')}</Label>
              <Select.Root type="single" value={type} onValueChange={pickType}>
                <Select.Trigger id="lich-resource-type" class="w-full">{t(type)}</Select.Trigger>
                <Select.Content>
                  {#each RESOURCE_TYPES as option (option)}
                    <Select.Item value={option} label={t(option)} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
            <div class="grid min-w-0 gap-1.5">
              <Label for="lich-resource-capacity">{t('Capacity')}</Label>
              <Input
                id="lich-resource-capacity"
                bind:value={capacityText}
                inputmode="numeric"
                autocomplete="off"
                aria-invalid={!isCapacityValid}
                aria-describedby="lich-resource-capacity-hint"
              />
            </div>
          </div>
          <p id="lich-resource-capacity-hint" class="-mt-3 mb-0 text-xs text-muted-foreground">{t('CapacityHint')}</p>

          <div class="grid gap-3">
            <div class="flex items-start justify-between gap-3">
              <div class="grid gap-0.5">
                <Label for="lich-resource-approval">{t('NeedsApproval')}</Label>
                <p class="m-0 text-xs text-muted-foreground">{t('NeedsApprovalHint')}</p>
              </div>
              <Switch id="lich-resource-approval" checked={needsApproval} onCheckedChange={(next) => { needsApproval = next }} />
            </div>
            {#if needsApproval}
              <div class="grid gap-1.5">
                <Label for="lich-resource-approver">{t('Approver')}</Label>
                <Select.Root type="single" value={approver ?? MANAGER} onValueChange={(picked) => { approver = people.find((employee) => employee._id === picked)?._id }}>
                  <Select.Trigger id="lich-resource-approver" class="w-full" aria-describedby="lich-resource-approver-hint">{nameOf(approver) ?? t('BookersManager')}</Select.Trigger>
                  <Select.Content>
                    <Select.Item value={MANAGER} label={t('BookersManager')} />
                    {#each people as employee (employee._id)}
                      <Select.Item value={employee._id} label={formatName(employee.name)} />
                    {/each}
                  </Select.Content>
                </Select.Root>
                <p id="lich-resource-approver-hint" class="m-0 text-xs text-muted-foreground">{t('ApproverHint')}</p>
              </div>
            {/if}
          </div>

          {#if isSaveFailed}
            <p class="m-0 text-sm text-destructive" role="alert">{t('SaveFailed')}</p>
          {/if}
        </div>

        <Dialog.Footer class="mx-0 mb-0 px-6">
          <Button type="button" variant="ghost" onclick={() => { isFormOpen = false }}>{t('Cancel')}</Button>
          <Button type="submit" disabled={!canSave}>{t('Save')}</Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  {/if}
</Dialog.Root>
