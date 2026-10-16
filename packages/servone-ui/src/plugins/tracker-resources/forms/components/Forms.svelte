<!-- A project's Forms page: its forms (templates that carry questions) and the editor for one (`?form=<id>`). -->
<script lang="ts">
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import { EmptyMarkup } from '@hcengineering/text-core'
  import { IssuePriority, type Project } from '@hcengineering/tracker'
  import { Label, getCurrentLocation, location, navigate, showPopup, themeStore } from '@hcengineering/ui'
  import { ArrowLeft, ClipboardList, Plus, Trash2 } from '@lucide/svelte'
  import {
    ensureFormAttributes,
    FORM_VERSION,
    formTemplateClass,
    serializeFormDefinition,
    templateForm,
    type FormTemplate
  } from '@servone/forms'
  import { Button } from '../../../../lib/components/ui/button'
  import { Input } from '../../../../lib/components/ui/input'
  import { str } from '../../sprints/plugin'
  import { canSetUp } from '../../sprints/setup'
  import FormEditor from './FormEditor.svelte'

  export let currentSpace: Ref<Project>

  const FORM_QUERY = 'form'

  const client = getClient()

  let forms: FormTemplate[] = []
  let isLoaded = false
  const formsQuery = createQuery()
  $: formsQuery.query(
    formTemplateClass,
    { space: currentSpace },
    (templates) => {
      forms = templates.filter(isForm)
      isLoaded = true
    },
    { sort: { title: SortingOrder.Ascending } }
  )

  function isForm (template: FormTemplate): boolean {
    return template.servoneForm !== undefined && template.servoneForm !== ''
  }

  $: selectedId = $location.query?.[FORM_QUERY] ?? undefined
  $: selected = forms.find((form) => form._id === selectedId)

  function open (id: Ref<FormTemplate> | undefined): void {
    const loc = getCurrentLocation()
    const query = Object.fromEntries(Object.entries(loc.query ?? {}).filter(([key]) => key !== FORM_QUERY))
    navigate({ ...loc, query: id === undefined ? query : { ...query, [FORM_QUERY]: id } })
  }

  let isCreating = false
  async function createForm (): Promise<void> {
    isCreating = true
    try {
      if (canSetUp()) await ensureFormAttributes(client)
      const id = await client.createDoc(formTemplateClass, currentSpace, {
        title: await translate(str.UntitledForm, {}, $themeStore.language),
        description: EmptyMarkup,
        priority: IssuePriority.NoPriority,
        assignee: null,
        component: null,
        milestone: null,
        estimation: 0,
        labels: [],
        children: [],
        comments: 0,
        attachments: 0,
        relations: [],
        servoneForm: serializeFormDefinition({ version: FORM_VERSION, fields: [] }),
        servoneFormStatus: null
      })
      open(id)
    } finally {
      isCreating = false
    }
  }

  function rename (form: FormTemplate, title: string): void {
    const trimmed = title.trim()
    if (trimmed === '' || trimmed === form.title) return
    void client.updateDoc(formTemplateClass, form.space, form._id, { title: trimmed })
  }

  function confirmDelete (form: FormTemplate): void {
    showPopup(MessageBox, {
      label: str.DeleteForm,
      message: str.DeleteFormConfirm,
      okLabel: str.DeleteForm,
      dangerous: true,
      action: async () => {
        await client.removeDoc(form._class, form.space, form._id)
        open(undefined)
      }
    })
  }

  function questionCount (form: FormTemplate): number {
    return templateForm(form)?.fields.length ?? 0
  }
</script>

<div class="h-full min-h-0 overflow-y-auto">
  <div class="mx-auto grid w-full max-w-3xl gap-6 p-6">
    {#if selected !== undefined}
      {@const form = selected}
      <div class="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onclick={() => { open(undefined) }}>
          <ArrowLeft />
          <Label label={str.AllForms} />
        </Button>
        <Button variant="ghost" size="sm" onclick={() => { confirmDelete(form) }}>
          <Trash2 />
          <Label label={str.DeleteForm} />
        </Button>
      </div>
      {#key form._id}
        <Input
          class="h-10 text-lg font-semibold"
          value={form.title}
          aria-label={form.title}
          onchange={(ev) => { rename(form, ev.currentTarget.value) }}
        />
        <FormEditor {form} />
      {/key}
    {:else}
      <div class="flex items-start justify-between gap-4">
        <div class="grid gap-1">
          <h2 class="m-0 text-lg font-semibold"><Label label={str.Forms} /></h2>
          <p class="m-0 text-sm text-muted-foreground"><Label label={str.FormsHint} /></p>
        </div>
        <Button size="sm" disabled={isCreating} onclick={() => { void createForm() }}>
          <Plus />
          <Label label={str.NewForm} />
        </Button>
      </div>
      {#if isLoaded && forms.length === 0}
        <div class="grid justify-items-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <ClipboardList class="size-6 text-muted-foreground" />
          <p class="m-0 text-sm font-medium"><Label label={str.NoForms} /></p>
        </div>
      {:else}
        <div class="grid gap-2">
          {#each forms as form (form._id)}
            <button
              type="button"
              class="flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3 text-left hover:bg-accent"
              on:click={() => { open(form._id) }}
            >
              <span class="flex items-center gap-2 text-sm font-medium">
                <ClipboardList class="size-4 text-muted-foreground" />
                {form.title}
              </span>
              <span class="text-sm text-muted-foreground"><Label label={str.QuestionCount} params={{ count: questionCount(form) }} /></span>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
