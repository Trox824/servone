<!-- A project's Members tab. services/servone/src/dept-channels does the department joining. Also mounted by Quy trình (SRV-20). -->
<script lang="ts">
  import contact, { type Employee } from '@hcengineering/contact'
  import { AssigneePopup, PersonRefPresenter } from '@hcengineering/contact-resources'
  import core, { type AccountUuid, type Ref, type RefTo } from '@hcengineering/core'
  import hr, { type Department } from '@hcengineering/hr'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { createQuery, getClient, ObjectPopup } from '@hcengineering/presentation'
  import tracker, { type Project } from '@hcengineering/tracker'
  import { eventToHTMLElement, Label, showPopup } from '@hcengineering/ui'
  import { Building2, Plus, X } from '@lucide/svelte'
  import { Badge } from '../../../lib/components/ui/badge'
  import { Button } from '../../../lib/components/ui/button'
  import { str } from '../sprints/plugin'
  import { canSetUp } from '../sprints/setup'
  import { isWorkflowType } from '../workflows/nav'

  export let currentSpace: Ref<Project>

  interface ProjectWithSync extends Project {
    servoneSyncDepartment?: Ref<Department> | null
  }
  const SYNC_DEPARTMENT_ATTR = 'servoneSyncDepartment' satisfies keyof ProjectWithSync

  const canEdit = canSetUp()
  const client = getClient()
  const projectQuery = createQuery()
  const employeeQuery = createQuery()
  const departmentQuery = createQuery()

  let project: ProjectWithSync | undefined
  let employees: Employee[] = []
  let department: Department | undefined

  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (found) => { project = found[0] })
  $: members = project?.members ?? []
  $: isWorkflow = project !== undefined && isWorkflowType(project.type)
  $: employeeQuery.query(contact.mixin.Employee, { personUuid: { $in: members } }, (found) => { employees = found }, {
    sort: { name: 1 }
  })
  $: syncDepartment = project?.servoneSyncDepartment ?? undefined
  $: if (syncDepartment !== undefined) {
    departmentQuery.query(hr.class.Department, { _id: syncDepartment }, (found) => { department = found[0] })
  } else {
    departmentQuery.unsubscribe()
    department = undefined
  }

  async function saveMembers (next: AccountUuid[]): Promise<void> {
    if (project !== undefined) await client.update(project, { members: next })
  }

  function addMember (e: MouseEvent): void {
    showPopup(
      AssigneePopup,
      { docQuery: { active: true }, ignoreUsers: employees.map((it) => it._id), allowDeselect: false },
      eventToHTMLElement(e),
      (employee: Employee | undefined) => {
        const account = employee?.personUuid
        if (account !== undefined && !members.includes(account)) void saveMembers([...members, account])
      }
    )
  }

  async function ensureSyncAttribute (): Promise<void> {
    const existing = await client.findOne(core.class.Attribute, {
      attributeOf: tracker.class.Project,
      name: SYNC_DEPARTMENT_ATTR
    })
    if (existing !== undefined) return
    const departmentRef: RefTo<Department> = { _class: core.class.RefTo, label: core.string.Ref, to: hr.class.Department }
    await client.createDoc(core.class.Attribute, core.space.Model, {
      attributeOf: tracker.class.Project,
      name: SYNC_DEPARTMENT_ATTR,
      label: getEmbeddedLabel('Sync with department'),
      type: departmentRef,
      isCustom: true,
      hidden: true
    })
  }

  async function saveSync (next: Ref<Department> | null): Promise<void> {
    if (project === undefined) return
    await ensureSyncAttribute()
    await client.update(project, { servoneSyncDepartment: next })
  }

  function pickDepartment (e: MouseEvent): void {
    showPopup(
      ObjectPopup,
      { _class: hr.class.Department, selected: syncDepartment, type: 'presenter' },
      eventToHTMLElement(e),
      (picked: Department | undefined) => {
        if (picked !== undefined && picked._id !== syncDepartment) void saveSync(picked._id)
      }
    )
  }
</script>

<div class="h-full min-h-0 overflow-y-auto" data-id="project-members">
  <div class="mx-auto grid w-full max-w-3xl gap-6 p-6">
    <div class="grid gap-1">
      <h2 class="m-0 text-lg font-semibold"><Label label={str.Members} /></h2>
      <p class="m-0 text-sm text-muted-foreground">
        {#if !canEdit}
          <Label label={str.MembersReadOnly} />
        {:else}
          <Label label={isWorkflow ? str.WorkflowMembersHint : str.MembersHint} />
        {/if}
      </p>
    </div>

    <section class="flex items-center gap-4 rounded-lg border p-3" data-id="sync-department">
      <div class="grid min-w-0 flex-1 gap-0.5">
        <span class="text-sm font-medium"><Label label={str.SyncDepartment} /></span>
        <span class="text-xs text-muted-foreground"><Label label={isWorkflow ? str.WorkflowSyncDepartmentHint : str.SyncDepartmentHint} /></span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" class="max-w-56" disabled={!canEdit} onclick={pickDepartment}>
          <Building2 />
          <span class="truncate">
            {#if department !== undefined}{department.name}{:else}<Label label={str.SyncDepartmentOff} />{/if}
          </span>
        </Button>
        {#if canEdit && syncDepartment !== undefined}
          <Button variant="ghost" size="icon-sm" onclick={() => { void saveSync(null) }}>
            <X />
            <span class="sr-only"><Label label={str.StopSyncDepartment} /></span>
          </Button>
        {/if}
      </div>
    </section>

    <section class="overflow-hidden rounded-lg border" data-id="member-list">
      <div class="flex h-9 items-center gap-2 bg-muted/50 pr-1.5 pl-3">
        <span class="text-sm font-medium"><Label label={str.Members} /></span>
        <span class="text-xs text-muted-foreground tabular-nums">{employees.length}</span>
        {#if canEdit}
          <Button variant="ghost" size="xs" class="ml-auto" onclick={addMember}>
            <Plus />
            <Label label={str.AddMember} />
          </Button>
        {/if}
      </div>
      <div class="divide-y border-t">
        {#each employees as employee (employee._id)}
          {@const account = employee.personUuid}
          <div class="group/row flex h-11 items-center gap-2 pr-1.5 pl-3" data-id="member-row">
            <div class="min-w-0 flex-1 truncate text-sm">
              <PersonRefPresenter value={employee._id} avatarSize="small" disabled />
            </div>
            {#if employee.position != null && employee.position !== ''}
              <span class="max-w-48 truncate text-xs text-muted-foreground">{employee.position}</span>
            {/if}
            {#if account !== undefined && project?.owners?.includes(account) === true}
              <Badge variant="secondary"><Label label={isWorkflow ? str.WorkflowOwner : str.ProjectOwner} /></Badge>
            {/if}
            {#if canEdit && account !== undefined}
              <Button
                variant="ghost"
                size="icon-xs"
                class="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                onclick={() => { void saveMembers(members.filter((it) => it !== account)) }}
              >
                <X />
                <span class="sr-only"><Label label={str.RemoveMember} /></span>
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  </div>
</div>
