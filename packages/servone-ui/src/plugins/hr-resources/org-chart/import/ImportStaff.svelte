<script lang="ts">
  import contact, { getName, type Employee } from '@hcengineering/contact'
  import { buildSocialIdString, SocialIdType, type Ref } from '@hcengineering/core'
  import hr, { type Department } from '@hcengineering/hr'
  import { getClient } from '@hcengineering/presentation'
  import { themeStore } from '@hcengineering/ui'
  import { ChevronRight, CircleCheck, Download, FileSpreadsheet, TriangleAlert } from '@lucide/svelte'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Button } from '../../../../lib/components/ui/button'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import { Label } from '../../../../lib/components/ui/label'
  import { Switch } from '../../../../lib/components/ui/switch'
  import { parseStaffCsv, skippedRowsCsv, type StaffRow } from './csv'
  import { planImport, type Change, type ExistingPerson, type ImportPlan, type PlannedRow, type PlanProblem } from './plan'
  import { runImport, type ImportOutcome } from './run'
  import { SAMPLE_CSV, SAMPLE_FILE_NAME } from './sample'
  import { failureKey, problemKey, textOf, type StringKey } from './strings'

  export let departments: Department[]
  export let employees: Employee[]
  export let onClose: () => void

  const client = getClient()
  const hierarchy = client.getHierarchy()
  $: t = textOf($themeStore.language)

  type Step =
    | { kind: 'pick', error?: string }
    | { kind: 'reading', fileName: string }
    | { kind: 'preview', fileName: string, plan: ImportPlan<Ref<Employee>>, people: Array<ExistingPerson<Ref<Employee>>> }
    | { kind: 'running', done: number, total: number, stop: AbortController }
    | { kind: 'done', outcome: ImportOutcome, plan: ImportPlan<Ref<Employee>>, error?: string }
  let step: Step = { kind: 'pick' }
  let isDragging = false
  let sendInvites = true
  let isStopping = false
  let showUnchanged = false

  const CHANGE_KEYS: Record<Change, StringKey> = { title: 'ChangeTitle', department: 'ChangeDepartment', manager: 'ChangeManager' }

  const SKIPPED_FILE_NAME = 'servone-dong-bo-qua.csv'

  function download (csv: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  async function existingPeople (rows: StaffRow[]): Promise<Array<ExistingPerson<Ref<Employee>>>> {
    const staff = new Map(employees.filter((employee) => employee.role !== 'GUEST').map((employee) => [employee._id, employee]))
    const fileKeys = rows.flatMap((row) => [row.email, row.managerEmail])
      .filter((email) => email !== '')
      .map((email) => buildSocialIdString({ type: SocialIdType.EMAIL, value: email }))
    const [staffIdentities, fileIdentities] = await Promise.all([
      client.findAll(contact.class.SocialIdentity, { type: SocialIdType.EMAIL, attachedTo: { $in: [...staff.keys()] } }),
      client.findAll(contact.class.SocialIdentity, { key: { $in: fileKeys } })
    ])
    return [...staffIdentities, ...fileIdentities].map((identity) => {
      const employee = staff.get(identity.attachedTo as Ref<Employee>)
      return {
        _id: identity.attachedTo as Ref<Employee>,
        email: identity.value.toLowerCase(),
        isStaff: employee !== undefined,
        title: employee?.position ?? '',
        department: (employee === undefined ? undefined : hierarchy.asIf(employee, hr.mixin.Staff)?.department) ?? hr.ids.Head
      }
    })
  }

  async function readFile (file: File): Promise<void> {
    step = { kind: 'reading', fileName: file.name }
    const bytes = await file.arrayBuffer()
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch (err) {
      if (!(err instanceof TypeError)) throw err
      step = { kind: 'pick', error: t('FileNotUtf8') }
      return
    }
    const parsed = parseStaffCsv(text)
    if ('fileError' in parsed) {
      step = { kind: 'pick', error: t(parsed.fileError === 'Empty' ? 'FileEmpty' : 'FileNoEmail') }
      return
    }
    const people = await existingPeople([...parsed.rows, ...parsed.errors.map((error) => error.row)])
    const plan = planImport(parsed, people, departments)
    step = { kind: 'preview', fileName: file.name, plan, people }
  }

  function pick (files: FileList | null | undefined): void {
    const file = files?.[0]
    if (file === undefined) return
    readFile(file).catch((err) => {
      step = { kind: 'pick', error: t('FileUnreadable', { reason: err instanceof Error ? err.message : String(err) }) }
    })
  }

  async function confirm (plan: ImportPlan<Ref<Employee>>, people: Array<ExistingPerson<Ref<Employee>>>): Promise<void> {
    const running = {
      kind: 'running' as const,
      done: 0,
      total: plan.rows.filter((planned) => planned.action !== 'unchanged').length,
      stop: new AbortController()
    }
    step = running
    isStopping = false
    try {
      const outcome = await runImport(client, plan, people, departments, {
        sendInvites,
        signal: running.stop.signal,
        onProgress: (done) => { step = { ...running, done } }
      })
      step = { kind: 'done', outcome, plan }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      step = { kind: 'done', outcome: { created: 0, updated: 0, failures: [], remaining: 0 }, plan, error: t('ImportAborted', { reason }) }
    }
  }

  function downloadSkipped (plan: ImportPlan<Ref<Employee>>, failures: ImportOutcome['failures']): void {
    const entries = [
      ...plan.errors.map((error) => ({ row: error.row, reason: t(problemKey(error.problem)) })),
      ...failures.map((failure) => ({ row: failure.row, reason: t(failureKey(failure.error)) }))
    ].sort((a, b) => a.row.line - b.row.line)
    download(skippedRowsCsv(entries, t), SKIPPED_FILE_NAME)
  }

  function departmentName (key: string, plan: ImportPlan<Ref<Employee>>): string {
    return departments.find((dept) => dept._id === key)?.name ?? plan.newDepartments.find((dept) => dept.key === key)?.name ?? key
  }

  interface TableRow {
    row: StaffRow
    problem?: PlanProblem
    action?: PlannedRow['action']
    changes: Change[]
  }

  $: plan = step.kind === 'preview' ? step.plan : undefined
  $: counts = {
    create: plan?.rows.filter((planned) => planned.action === 'create').length ?? 0,
    update: plan?.rows.filter((planned) => planned.action === 'update').length ?? 0,
    unchanged: plan?.rows.filter((planned) => planned.action === 'unchanged').length ?? 0,
    skip: plan?.errors.length ?? 0
  }
  $: toImport = counts.create + counts.update
  $: importLabel = toImport === 0
    ? t('NothingToImport')
    : !sendInvites || counts.create === 0
        ? t('Import', { count: toImport })
        : counts.create === toImport
          ? t('ImportAndInvite', { count: toImport })
          : t('ImportAndInviteNew', { count: toImport, invited: counts.create })
  const ACTION_ORDER: Record<PlannedRow['action'], number> = { update: 0, create: 1, unchanged: 2 }
  $: tableRows = plan === undefined
    ? []
    : [
        ...plan.errors.map((error): TableRow => ({ row: error.row, problem: error.problem, changes: [] })),
        ...[...plan.rows]
          .filter((planned) => showUnchanged || planned.action !== 'unchanged')
          .sort((a, b) => ACTION_ORDER[a.action] - ACTION_ORDER[b.action])
          .map((planned): TableRow => ({
            row: planned.row,
            action: planned.action,
            changes: planned.action === 'create' ? [] : planned.changes
          }))
      ]
  $: namesById = new Map<string, string>(employees.map((employee) => [employee._id, getName(hierarchy, employee)]))
  $: namesByEmail = step.kind !== 'preview'
    ? new Map<string, string>()
    : new Map<string, string>([
      ...step.people.flatMap((person): Array<[string, string]> => {
        const name = namesById.get(person._id)
        return name === undefined ? [] : [[person.email, name]]
      }),
      ...step.plan.rows.filter((planned) => planned.row.name !== '').map((planned): [string, string] => [planned.row.email, planned.row.name])
    ])
  $: heads = plan === undefined
    ? []
    : [...plan.heads].map(([key, email]) => {
        const previousId = departments.find((dept) => dept._id === key)?.teamLead
        const previous = previousId === undefined || previousId === null ? undefined : namesById.get(previousId)
        const params = { department: departmentName(key, plan), name: namesByEmail.get(email) ?? email }
        return previous === undefined ? t('HeadSet', params) : t('HeadReplaces', { ...params, previous })
      })
</script>

<Dialog.Root open onOpenChange={(isOpen) => { if (!isOpen && step.kind !== 'running') onClose() }}>
  <Dialog.Content class="top-[10vh] flex max-h-[80vh] translate-y-0 flex-col gap-0 p-0 sm:max-w-4xl" showCloseButton={step.kind !== 'running'}>
    <div class="grid gap-1.5 px-6 pb-4 pt-6">
      <Dialog.Title class="pr-8 text-lg font-semibold">{t('Title')}</Dialog.Title>
      {#if step.kind === 'pick' || step.kind === 'reading'}
        <Dialog.Description class="text-muted-foreground">{t('Intro')}</Dialog.Description>
      {/if}
    </div>

    {#if step.kind === 'pick' || step.kind === 'reading'}
      <div class="grid gap-3 px-6 pb-6">
        <label
          class="drop"
          class:is-dragging={isDragging}
          on:dragover|preventDefault={() => { isDragging = true }}
          on:dragleave={() => { isDragging = false }}
          on:drop|preventDefault={(event) => { isDragging = false; pick(event.dataTransfer?.files) }}
        >
          <FileSpreadsheet class="size-6 text-muted-foreground" aria-hidden="true" />
          {#if step.kind === 'reading'}
            <span class="text-sm" role="status">{t('Reading', { file: step.fileName })}</span>
          {:else}
            <span class="text-sm"><span class="font-medium text-primary">{t('ChooseFile')}</span> {t('DropHint')}</span>
          {/if}
          <input
            type="file"
            accept=".csv,text/csv"
            class="sr-only"
            disabled={step.kind === 'reading'}
            on:change={(event) => { pick(event.currentTarget.files); event.currentTarget.value = '' }}
          />
        </label>
        {#if step.kind === 'pick' && step.error !== undefined}
          <p class="m-0 flex items-start gap-2 text-sm text-destructive" role="alert">
            <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{step.error}
          </p>
        {/if}
        <div>
          <Button variant="ghost" size="sm" class="-ml-2" onclick={() => { download(SAMPLE_CSV, SAMPLE_FILE_NAME) }}>
            <Download />{t('DownloadSample')}
          </Button>
        </div>
      </div>
    {:else if step.kind === 'preview' && plan !== undefined}
      {@const preview = step}
      <div class="grid gap-2 border-b px-6 pb-4 text-sm">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span class="flex min-w-0 items-center gap-1.5 font-medium">
            <FileSpreadsheet class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span class="truncate">{preview.fileName}</span>
          </span>
          <span class="tabular-nums">{t('SummaryCreate', { count: counts.create })}</span>
          <span class="tabular-nums">{t('SummaryUpdate', { count: counts.update })}</span>
          <span class="tabular-nums text-muted-foreground">{t('SummaryUnchanged', { count: counts.unchanged })}</span>
          <span class="tabular-nums" class:text-destructive={counts.skip > 0}>{t('SummarySkip', { count: counts.skip })}</span>
          <span class="ml-auto flex gap-1">
            {#if counts.skip > 0}
              <Button variant="ghost" size="sm" onclick={() => { downloadSkipped(preview.plan, []) }}>
                <Download />{t('DownloadSkipped')}
              </Button>
            {/if}
            <Button variant="ghost" size="sm" onclick={() => { step = { kind: 'pick' } }}>
              {t('ChooseAnother')}
            </Button>
          </span>
        </div>
        {#if plan.newDepartments.length > 0}
          <p class="m-0 text-muted-foreground">{t('NewDepartments', { names: plan.newDepartments.map((dept) => dept.name).join(', ') })}</p>
        {/if}
        {#if heads.length > 0}
          <p class="m-0 text-muted-foreground">{t('HeadChanges', { pairs: heads.join(' · ') })}</p>
        {/if}
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <table class="w-full border-collapse text-sm">
          <thead class="sticky top-0 z-[1] bg-popover text-left text-xs text-muted-foreground">
            <tr>
              <th class="w-14 py-2 pl-6 pr-2 font-medium">{t('Line')}</th>
              <th class="py-2 pr-3 font-medium">{t('Name')}</th>
              <th class="py-2 pr-3 font-medium">{t('Email')}</th>
              <th class="py-2 pr-3 font-medium">{t('JobTitle')}</th>
              <th class="py-2 pr-3 font-medium">{t('Department')}</th>
              <th class="py-2 pr-3 font-medium">{t('Manager')}</th>
              <th class="py-2 pr-6 font-medium">{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {#each tableRows as entry (entry.row.line)}
              <tr class="border-t align-top" class:is-error={entry.problem !== undefined}>
                <th scope="row" class="py-2 pl-6 pr-2 text-left font-normal tabular-nums text-muted-foreground">
                  <span class="sr-only">{t('Line')} </span>{entry.row.line}
                </th>
                <td class="max-w-40 truncate py-2 pr-3 font-medium" title={entry.row.name}>{entry.row.name}</td>
                <td class="max-w-52 truncate py-2 pr-3" title={entry.row.email}>{entry.row.email}</td>
                <td class="max-w-40 truncate py-2 pr-3 text-muted-foreground" title={entry.row.title}>{entry.row.title}</td>
                <td class="max-w-36 truncate py-2 pr-3 text-muted-foreground" title={entry.row.department}>{entry.row.department}</td>
                <td class="max-w-44 truncate py-2 pr-3 text-muted-foreground" title={entry.row.managerEmail}>
                  {namesByEmail.get(entry.row.managerEmail) ?? entry.row.managerEmail}
                </td>
                <td class="py-2 pr-6">
                  {#if entry.problem !== undefined}
                    <Badge variant="destructive">{t('Skipped')}</Badge>
                    <span class="mt-1 block max-w-56 text-xs text-destructive">{t(problemKey(entry.problem))}</span>
                  {:else if entry.action === 'create'}
                    <Badge variant="secondary">{t('New')}</Badge>
                  {:else if entry.action === 'update'}
                    <Badge variant="outline">{t('Update')}</Badge>
                    <span class="mt-1 block text-xs text-muted-foreground">{entry.changes.map((change) => t(CHANGE_KEYS[change])).join(', ')}</span>
                  {:else}
                    <span class="text-xs text-muted-foreground">{t('Unchanged')}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if counts.unchanged > 0}
          <button type="button" class="unchanged-toggle" aria-expanded={showUnchanged} on:click={() => { showUnchanged = !showUnchanged }}>
            <ChevronRight class="size-4 transition-transform {showUnchanged ? 'rotate-90' : ''}" aria-hidden="true" />
            {t('UnchangedRows', { count: counts.unchanged })}
          </button>
        {/if}
      </div>
      <Dialog.Footer class="mx-0 mb-0 items-center border-t px-6 sm:justify-between">
        {#if counts.create > 0}
          <div class="flex items-center gap-3">
            <Switch id="import-send-invites" checked={sendInvites} onCheckedChange={(isChecked) => { sendInvites = isChecked }} aria-describedby="import-send-invites-hint" />
            <Label for="import-send-invites" class="grid gap-0.5 font-normal">
              <span>{t('SendInvites')}</span>
              <span id="import-send-invites-hint" class="max-w-md text-xs text-muted-foreground">{t('SendInvitesHint')}</span>
            </Label>
          </div>
        {/if}
        <div class="flex gap-2 sm:ml-auto">
          <Button variant="ghost" onclick={onClose}>{t('Cancel')}</Button>
          <Button disabled={toImport === 0} onclick={() => { void confirm(preview.plan, preview.people) }}>
            {importLabel}
          </Button>
        </div>
      </Dialog.Footer>
    {:else if step.kind === 'running'}
      {@const running = step}
      <div class="grid gap-3 px-6 pb-4">
        <p class="m-0 text-sm tabular-nums" role="status">
          {isStopping ? t('Stopping') : t('Importing', { done: running.done, total: running.total })}
        </p>
        <div
          class="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={t('ImportProgress')}
          aria-valuemin={0}
          aria-valuemax={running.total}
          aria-valuenow={running.done}
        >
          <div class="h-full bg-primary transition-[width]" style:width="{running.total === 0 ? 0 : (running.done / running.total) * 100}%"></div>
        </div>
      </div>
      <Dialog.Footer class="mx-0 mb-0 px-6">
        <Button variant="outline" disabled={isStopping} onclick={() => { isStopping = true; running.stop.abort() }}>{t('Stop')}</Button>
      </Dialog.Footer>
    {:else if step.kind === 'done'}
      <div class="grid gap-3 px-6 pb-2">
        {#if step.error !== undefined}
          <p class="m-0 flex items-start gap-2 text-sm text-destructive" role="alert">
            <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{step.error}
          </p>
        {:else if step.outcome.remaining > 0}
          <p class="m-0 flex items-center gap-2 text-sm font-medium" role="status">
            <TriangleAlert class="size-4 text-muted-foreground" aria-hidden="true" />{t('Stopped')}
          </p>
          <p class="m-0 text-sm">
            {t('StoppedSummary', { created: step.outcome.created, updated: step.outcome.updated, remaining: step.outcome.remaining })}
          </p>
        {:else}
          <p class="m-0 flex items-center gap-2 text-sm font-medium" role="status">
            <CircleCheck class="size-4 text-primary" aria-hidden="true" />{t('Done')}
          </p>
          <p class="m-0 text-sm">{t('DoneSummary', { created: step.outcome.created, updated: step.outcome.updated })}</p>
        {/if}
        {#if !sendInvites && step.outcome.created > 0}
          <p class="m-0 text-sm text-muted-foreground">{t('InviteLater')}</p>
        {/if}
        {#if step.outcome.failures.length > 0}
          <p class="m-0 text-sm text-destructive">{t('Failed', { count: step.outcome.failures.length })}</p>
          <ul class="m-0 grid max-h-60 gap-1 overflow-auto p-0 text-sm">
            {#each step.outcome.failures as failure (failure.row.line)}
              <li class="list-none">
                <span class="tabular-nums text-muted-foreground">{t('Line')} {failure.row.line}</span>
                · {failure.row.email}: <span class="text-destructive" title={failure.error.message}>{t(failureKey(failure.error))}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <Dialog.Footer class="mx-0 mb-0 px-6 sm:justify-between">
        {#if step.plan.errors.length + step.outcome.failures.length > 0}
          {@const done = step}
          <Button variant="ghost" onclick={() => { downloadSkipped(done.plan, done.outcome.failures) }}>
            <Download />{t('DownloadSkipped')}
          </Button>
        {/if}
        <Button class="sm:ml-auto" onclick={onClose}>{t('Close')}</Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 9rem;
    padding: 1.5rem;
    border: 1px dashed var(--border);
    border-radius: 0.5rem;
    cursor: pointer;
    text-align: center;
  }
  .drop:hover,
  .drop.is-dragging {
    border-color: var(--primary);
    background: var(--accent);
  }
  .drop:focus-within {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .unchanged-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    padding: 0.5rem 1.5rem;
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--muted-foreground);
    text-align: left;
  }
  .unchanged-toggle:hover {
    color: var(--foreground);
  }
  .unchanged-toggle:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  .is-error {
    background: color-mix(in srgb, var(--destructive) 5%, transparent);
  }
</style>
