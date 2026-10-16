<!-- A project's Create form tab: the template every New issue dialog in this project opens with. Also mounted by Quy trình (SRV-20). -->
<script lang="ts">
  import core, { getCurrentAccount, type Ref, type RefTo, SortingOrder } from '@hcengineering/core'
  import { getEmbeddedLabel, translateCB } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tracker, { type IssueTemplate, type Project } from '@hcengineering/tracker'
  import { Label, themeStore } from '@hcengineering/ui'
  import { ArrowLeft, Pencil } from '@lucide/svelte'
  import { formTemplateClass, type FormTemplate } from '@servone/forms'
  import { Button } from '../../../lib/components/ui/button'
  import * as Select from '../../../lib/components/ui/select'
  import FormEditor from '../forms/components/FormEditor.svelte'
  import { str } from '../sprints/plugin'
  import { canSetUp } from '../sprints/setup'
  import { isWorkflowType } from '../workflows/nav'

  export let currentSpace: Ref<Project>

  interface ProjectWithTemplate extends Project {
    servoneDefaultTemplate?: Ref<IssueTemplate> | null
  }

  const DEFAULT_TEMPLATE_ATTR = 'servoneDefaultTemplate' satisfies keyof ProjectWithTemplate
  const NONE = 'none'

  const client = getClient()

  let noneText = ''
  $: translateCB(str.NoDefaultTemplate, {}, $themeStore.language, (text) => { noneText = text })

  let project: ProjectWithTemplate | undefined
  const projectQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (found) => { project = found[0] })

  let templates: FormTemplate[] = []
  const templatesQuery = createQuery()
  $: templatesQuery.query(
    formTemplateClass,
    { space: currentSpace },
    (found) => { templates = found },
    { sort: { title: SortingOrder.Ascending } }
  )

  $: canEdit = canSetUp() || project?.owners?.includes(getCurrentAccount().uuid) === true
  $: selected = templates.find((template) => template._id === project?.servoneDefaultTemplate)
  $: isForm = selected?.servoneForm !== undefined && selected.servoneForm !== ''
  $: isWorkflow = project !== undefined && isWorkflowType(project.type)

  let isEditing = false
  $: if (selected === undefined) isEditing = false

  async function ensureAttribute (): Promise<void> {
    if (!canSetUp()) return
    const existing = await client.findOne(core.class.Attribute, { attributeOf: tracker.class.Project, name: DEFAULT_TEMPLATE_ATTR })
    if (existing !== undefined) return
    const templateRef: RefTo<IssueTemplate> = { _class: core.class.RefTo, label: core.string.Ref, to: tracker.class.IssueTemplate }
    await client.createDoc(core.class.Attribute, core.space.Model, {
      attributeOf: tracker.class.Project,
      name: DEFAULT_TEMPLATE_ATTR,
      label: getEmbeddedLabel('Default template'),
      type: templateRef,
      isCustom: true,
      hidden: true
    })
  }

  async function pick (option: string): Promise<void> {
    if (project === undefined) return
    const next = templates.find((template) => template._id === option)?._id ?? null
    if (next === (project.servoneDefaultTemplate ?? null)) return
    await ensureAttribute()
    await client.update(project, { servoneDefaultTemplate: next })
  }
</script>

<div class="h-full min-h-0 overflow-y-auto" data-id="project-create-form">
  <div class="mx-auto grid w-full max-w-3xl gap-6 p-6">
    {#if isEditing && selected !== undefined}
      <div class="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onclick={() => { isEditing = false }}>
          <ArrowLeft />
          <Label label={str.CreateForm} />
        </Button>
        <span class="truncate text-sm font-medium">{selected.title}</span>
      </div>
      {#key selected._id}
        <FormEditor form={selected} />
      {/key}
    {:else}
      <div class="grid gap-1">
        <h2 class="m-0 text-lg font-semibold"><Label label={str.CreateForm} /></h2>
        <p class="m-0 text-sm text-muted-foreground">
          {#if !canEdit}
            <Label label={isWorkflow ? str.WorkflowCreateFormReadOnly : str.CreateFormReadOnly} />
          {:else}
            <Label label={isWorkflow ? str.WorkflowCreateFormHint : str.CreateFormHint} />
          {/if}
        </p>
      </div>

      <section class="grid gap-3 rounded-lg border p-4">
        <div class="flex items-center justify-between gap-4">
          <label for="default-template" class="text-sm font-medium"><Label label={str.DefaultTemplate} /></label>
          <Select.Root
            type="single"
            value={selected?._id ?? NONE}
            disabled={!canEdit || project === undefined}
            onValueChange={(option) => { void pick(option) }}
          >
            <Select.Trigger id="default-template" class="w-64">
              <span class="truncate">{selected?.title ?? noneText}</span>
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={NONE} label={noneText} />
              {#each templates as template (template._id)}
                <Select.Item value={template._id} label={template.title} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        {#if selected !== undefined}
          <div class="flex items-center justify-between gap-4 border-t pt-3">
            <p class="m-0 text-sm text-muted-foreground">
              {#if isWorkflow}
                <Label label={isForm ? str.WorkflowDefaultFormHint : str.WorkflowDefaultTemplateHint} />
              {:else}
                <Label label={isForm ? str.DefaultFormHint : str.DefaultTemplateHint} />
              {/if}
            </p>
            {#if isForm && canEdit}
              <Button variant="outline" size="sm" onclick={() => { isEditing = true }}>
                <Pencil />
                <Label label={str.EditForm} />
              </Button>
            {/if}
          </div>
        {/if}
      </section>
    {/if}
  </div>
</div>
