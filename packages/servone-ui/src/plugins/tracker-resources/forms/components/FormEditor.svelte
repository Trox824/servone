<!-- Questions, starting values and public link of one form, inside ./Forms.svelte. -->
<script lang="ts">
  import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
  import { SortingOrder, type AnyAttribute, type Ref, type Status } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { copyTextToClipboard, createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import tags, { type TagElement } from '@hcengineering/tags'
  import task from '@hcengineering/task'
  import tracker, { IssuePriority, type IssueStatus, type Milestone, type Project } from '@hcengineering/tracker'
  import { showPopup, themeStore } from '@hcengineering/ui'
  import { ArrowDown, ArrowUp, Plus, Trash2 } from '@lucide/svelte'
  import {
    checkFormDefinition,
    ensureFormAttributes,
    FORM_FIELD_KINDS,
    formAttributes,
    FORM_VERSION,
    formTemplateClass,
    serializeFormDefinition,
    templateForm,
    type DefinitionIssue,
    type FieldTarget,
    type FormField,
    type FormTemplate
  } from '@servone/forms'
  import { Button } from '../../../../lib/components/ui/button'
  import { Input } from '../../../../lib/components/ui/input'
  import { Label as FieldLabel } from '../../../../lib/components/ui/label'
  import * as Select from '../../../../lib/components/ui/select'
  import { Switch } from '../../../../lib/components/ui/switch'
  import { Textarea } from '../../../../lib/components/ui/textarea'
  import { str } from '../../sprints/plugin'
  import { RELEASE_CATEGORY } from '../../sprints/releases'
  import { canSetUp } from '../../sprints/setup'
  import type { StringKey } from '../../sprints/strings'
  import { ServiceApiError } from '../../../chunter-resources/webhooks/api'
  import {
    createFormLink,
    deleteFormLink,
    isFormLinkServiceConfigured,
    readFormLink,
    type FormLink
  } from '../api'
  import {
    DEFINITION_PROBLEM_TEXT,
    KIND_TEXT,
    moveField,
    newField,
    optionsFromText,
    parseTargetValue,
    rekind,
    TARGET_TEXT,
    targetsForKind,
    targetValue,
    withTarget
  } from '../builder'
  import { loadFormText, type FormText } from '../text'

  export let form: FormTemplate

  const client = getClient()
  const BUILT_IN_TARGETS: Array<Exclude<FieldTarget['to'], 'attribute'>> = ['title', 'description', 'append', 'priority', 'dueDate']
  const PROJECT_DEFAULT = 'default'
  const NONE = 'none'
  const COPIED_NOTE_MS = 2000
  const PRIORITY_TEXT: Array<[IssuePriority, StringKey]> = [
    [IssuePriority.NoPriority, 'PriorityNone'],
    [IssuePriority.Urgent, 'PriorityUrgent'],
    [IssuePriority.High, 'PriorityHigh'],
    [IssuePriority.Medium, 'PriorityMedium'],
    [IssuePriority.Low, 'PriorityLow']
  ]

  const TEXT_KEYS: StringKey[] = [
    'Questions',
    'AddQuestion',
    'QuestionLabel',
    'QuestionHelp',
    'AnswerType',
    'Fills',
    'RequiredAnswer',
    'ChoiceOptions',
    'RemoveQuestion',
    'MoveUp',
    'MoveDown',
    'NewIssuesGet',
    'NewIssuesGetHint',
    'Sprint',
    'Status',
    'Assignee',
    'Unassigned',
    'FormLabels',
    'NoLabels',
    'Priority',
    'FromAnswer',
    'NoSprint',
    'ProjectDefaultStatus',
    'SaveForm',
    'FormSaved',
    'NoTitleQuestion',
    'PublicLink',
    'PublicLinkHint',
    'CreatePublicLink',
    'CopyLink',
    'LinkCopied',
    'ReplaceLink',
    'TurnOffLink',
    'PublicLinkNeedsSave',
    'PublicLinkUnavailable',
    'PublicLinkFailed',
    ...PRIORITY_TEXT.map(([, key]) => key),
    ...Object.values(KIND_TEXT),
    ...Object.values(TARGET_TEXT),
    ...Object.values(DEFINITION_PROBLEM_TEXT)
  ]
  let t: FormText = (key) => key
  $: void loadFormText(TEXT_KEYS, $themeStore.language).then((loaded) => (t = loaded))

  let fields: FormField[] = []
  let status: Ref<IssueStatus> | null = null
  let sprint: Ref<Milestone> | null = null
  let assignee: Ref<Person> | null = null
  let labels: Array<Ref<TagElement>> = []
  let priority = IssuePriority.NoPriority
  let optionDrafts = new Map<string, string>()
  let problem: DefinitionIssue | undefined
  let isSaving = false
  let isSaved = false

  let loadedFor: Ref<FormTemplate> | undefined
  $: if (form._id !== loadedFor) load(form)
  function load (source: FormTemplate): void {
    loadedFor = source._id
    fields = templateForm(source)?.fields ?? []
    status = source.servoneFormStatus ?? null
    sprint = source.milestone ?? null
    assignee = source.assignee
    labels = source.labels ?? []
    priority = source.priority
    optionDrafts = new Map()
    problem = undefined
  }

  let project: Project | undefined
  const projectQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { _id: form.space }, (projects) => {
    project = projects[0]
  })
  let sprints: Milestone[] = []
  const sprintQuery = createQuery()
  $: sprintQuery.query(tracker.class.Milestone, { space: form.space }, (found) => {
    sprints = found
  })
  let people: Employee[] = []
  createQuery().query(contact.mixin.Employee, { active: true }, (found) => {
    people = found
  })
  let labelChoices: TagElement[] = []
  createQuery().query(
    tags.class.TagElement,
    { targetClass: tracker.class.Issue, category: { $ne: RELEASE_CATEGORY } },
    (found) => {
      labelChoices = found
    },
    { sort: { title: SortingOrder.Ascending } }
  )

  $: kinds = project === undefined ? [] : client.getModel().findAllSync(task.class.TaskType, { parent: project.type })
  $: kind = kinds.find((candidate) => candidate._id === form.kind) ?? kinds[0]
  $: attributes = kind === undefined ? [] : formAttributes(client.getHierarchy(), kind.targetClass)
  $: statuses = statusesOf(kind?.statuses ?? [])

  function statusesOf (ids: Array<Ref<Status>>): IssueStatus[] {
    const found = client.getModel().findAllSync(tracker.class.IssueStatus, { _id: { $in: ids } })
    return ids.flatMap((id) => found.filter((candidate) => candidate._id === id))
  }

  let attributeText = new Map<string, string>()
  $: void attributeLabels(attributes, $themeStore.language).then((loaded) => (attributeText = loaded))
  async function attributeLabels (list: AnyAttribute[], language: string): Promise<Map<string, string>> {
    const entries = await Promise.all(list.map(async (attribute) => [attribute.name, await translate(attribute.label, {}, language)] as const))
    return new Map(entries)
  }

  $: targetText = (target: FieldTarget): string =>
    target.to === 'attribute' ? attributeText.get(target.key) ?? target.key : t(TARGET_TEXT[target.to])
  $: sprintLabel = sprints.find((candidate) => candidate._id === sprint)?.label ?? t('NoSprint')
  $: statusLabel = statuses.find((candidate) => candidate._id === status)?.name ?? t('ProjectDefaultStatus')
  $: assigneePerson = people.find((candidate) => candidate._id === assignee)
  $: assigneeLabel = assigneePerson === undefined ? t('Unassigned') : formatName(assigneePerson.name)
  $: labelsLabel = labels.length === 0
    ? t('NoLabels')
    : labelChoices.filter((candidate) => labels.includes(candidate._id)).map((candidate) => candidate.title).join(', ')
  $: priorityLabel = t(PRIORITY_TEXT.find(([value]) => value === priority)?.[1] ?? 'PriorityNone')

  $: targets = [...BUILT_IN_TARGETS.map((to): FieldTarget => ({ to })), ...attributes.map((attribute): FieldTarget => ({ to: 'attribute', key: attribute.name }))]
  $: hasTitleQuestion = fields.some((field) => field.target.to === 'title')
  $: hasPriorityQuestion = fields.some((field) => field.target.to === 'priority')

  function touch (): void {
    isSaved = false
    problem = undefined
  }

  function edit (index: number, field: FormField): void {
    fields = fields.map((current, at) => (at === index ? field : current))
    touch()
  }

  function setFields (next: FormField[]): void {
    fields = next
    touch()
  }

  function forgetDraft (field: FormField): void {
    optionDrafts = new Map([...optionDrafts].filter(([id]) => id !== field.id))
  }

  function retarget (index: number, field: FormField, target: FieldTarget): void {
    forgetDraft(field)
    edit(index, withTarget(field, target, attributes))
  }

  function retype (index: number, field: FormField, picked: string): void {
    const next = FORM_FIELD_KINDS.find((choice) => choice === picked)
    if (next === undefined) return
    forgetDraft(field)
    edit(index, rekind(field, next, attributes))
  }

  function setOptions (index: number, field: FormField, text: string): void {
    optionDrafts = new Map(optionDrafts).set(field.id, text)
    edit(index, { ...field, options: optionsFromText(text) })
  }

  async function save (): Promise<void> {
    const definition = { version: FORM_VERSION, fields }
    problem = checkFormDefinition(definition)
    if (problem !== undefined) return
    isSaving = true
    try {
      if (canSetUp()) await ensureFormAttributes(client)
      await client.updateDoc(formTemplateClass, form.space, form._id, {
        servoneForm: serializeFormDefinition(definition),
        servoneFormStatus: status,
        milestone: sprint,
        assignee,
        labels,
        priority
      })
      isSaved = true
    } finally {
      isSaving = false
    }
  }

  $: savedForm = templateForm(form)
  $: hasSavedForm = savedForm !== undefined
  $: formId = form._id

  type LinkState = 'loading' | 'ready' | 'unavailable' | 'failed'
  let linkState: LinkState = 'loading'
  let link: FormLink | undefined
  let isCopied = false

  $: if (hasSavedForm) void loadLink(formId)
  async function loadLink (id: Ref<FormTemplate>): Promise<void> {
    if (!(await isFormLinkServiceConfigured())) {
      linkState = 'unavailable'
      return
    }
    await runLink(async () => await readFormLink(id))
  }

  async function runLink (call: () => Promise<FormLink | undefined>): Promise<void> {
    try {
      link = await call()
      linkState = 'ready'
    } catch (err) {
      if (!(err instanceof ServiceApiError || err instanceof TypeError)) throw err
      linkState = 'failed'
    }
  }

  function confirmLink (label: StringKey, message: StringKey, call: () => Promise<FormLink | undefined>): void {
    showPopup(MessageBox, {
      label: str[label],
      message: str[message],
      okLabel: str[label],
      dangerous: true,
      action: async () => {
        await runLink(call)
      }
    })
  }

  function copy (url: string): void {
    void copyTextToClipboard(url)
    isCopied = true
    setTimeout(() => (isCopied = false), COPIED_NOTE_MS)
  }
</script>

<div class="grid gap-8">
  <section class="grid gap-4">
    <h3 class="m-0 text-sm font-semibold">{t('Questions')}</h3>
    {#each fields as field, index (field.id)}
      {@const id = `servone-question-${field.id}`}
      {@const fillChoices = targetsForKind(field.kind, targets, attributes)}
      <div class="grid gap-3 rounded-lg border p-3" class:border-destructive={problem?.field === index}>
        <div class="flex items-start gap-2">
          <div class="grid flex-1 gap-1">
            <FieldLabel for="{id}-label">{t('QuestionLabel')} {index + 1}</FieldLabel>
            <Input
              id="{id}-label"
              value={field.label}
              oninput={(ev) => { edit(index, { ...field, label: ev.currentTarget.value }) }}
            />
          </div>
          <div class="flex gap-1 pt-5">
            <Button variant="ghost" size="icon" aria-label={t('MoveUp')} disabled={index === 0} onclick={() => { setFields(moveField(fields, index, -1)) }}>
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('MoveDown')}
              disabled={index === fields.length - 1}
              onclick={() => { setFields(moveField(fields, index, 1)) }}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('RemoveQuestion')}
              onclick={() => { setFields(fields.filter((_, at) => at !== index)) }}
            >
              <Trash2 />
            </Button>
          </div>
        </div>

        <Input
          aria-label={t('QuestionHelp')}
          placeholder={t('QuestionHelp')}
          value={field.help ?? ''}
          oninput={(ev) => { edit(index, { ...field, help: ev.currentTarget.value === '' ? undefined : ev.currentTarget.value }) }}
        />

        <div class="flex flex-wrap items-end gap-3">
          <div class="grid gap-1">
            <FieldLabel for="{id}-kind">{t('AnswerType')}</FieldLabel>
            <Select.Root type="single" value={field.kind} onValueChange={(picked) => { retype(index, field, picked) }}>
              <Select.Trigger id="{id}-kind" class="w-40">{t(KIND_TEXT[field.kind])}</Select.Trigger>
              <Select.Content>
                {#each FORM_FIELD_KINDS as choice (choice)}
                  <Select.Item value={choice} label={t(KIND_TEXT[choice])} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="grid gap-1">
            <FieldLabel for="{id}-target">{t('Fills')}</FieldLabel>
            <Select.Root
              type="single"
              value={targetValue(field.target)}
              onValueChange={(picked) => { retarget(index, field, parseTargetValue(picked)) }}
            >
              <Select.Trigger id="{id}-target" class="w-48" disabled={fillChoices.length < 2}>{targetText(field.target)}</Select.Trigger>
              <Select.Content>
                {#each fillChoices as target (targetValue(target))}
                  <Select.Item value={targetValue(target)} label={targetText(target)} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="flex h-8 items-center gap-2">
            <Switch
              id="{id}-required"
              checked={field.isRequired}
              onCheckedChange={(isRequired) => { edit(index, { ...field, isRequired }) }}
            />
            <FieldLabel for="{id}-required" class="font-normal">{t('RequiredAnswer')}</FieldLabel>
          </div>
        </div>

        {#if field.kind === 'select'}
          <div class="grid gap-1">
            <FieldLabel for="{id}-options">{t('ChoiceOptions')}</FieldLabel>
            <Textarea
              id="{id}-options"
              value={optionDrafts.get(field.id) ?? (field.options ?? []).join('\n')}
              disabled={field.target.to === 'priority'}
              oninput={(ev) => { setOptions(index, field, ev.currentTarget.value) }}
            />
          </div>
        {/if}

        {#if problem?.field === index}
          <p class="m-0 text-xs text-destructive">{t(DEFINITION_PROBLEM_TEXT[problem.problem])}</p>
        {/if}
      </div>
    {/each}

    <div>
      <Button variant="outline" size="sm" onclick={() => { setFields([...fields, newField()]) }}>
        <Plus />
        {t('AddQuestion')}
      </Button>
    </div>

    {#if fields.length > 0 && !hasTitleQuestion}
      <p class="m-0 text-xs text-muted-foreground">{t('NoTitleQuestion')}</p>
    {/if}
  </section>

  <section class="grid gap-4">
    <div class="grid gap-1">
      <h3 class="m-0 text-sm font-semibold">{t('NewIssuesGet')}</h3>
      <p class="m-0 text-sm text-muted-foreground">{t('NewIssuesGetHint')}</p>
    </div>
    <div class="grid grid-cols-[8rem_16rem] items-center gap-x-4 gap-y-2">
      <FieldLabel for="servone-form-sprint" class="font-normal">{t('Sprint')}</FieldLabel>
      <Select.Root
        type="single"
        value={sprint ?? NONE}
        onValueChange={(picked) => {
          sprint = sprints.find((candidate) => candidate._id === picked)?._id ?? null
          touch()
        }}
      >
        <Select.Trigger id="servone-form-sprint" class="w-full">{sprintLabel}</Select.Trigger>
        <Select.Content>
          <Select.Item value={NONE} label={t('NoSprint')} />
          {#each sprints as candidate (candidate._id)}
            <Select.Item value={candidate._id} label={candidate.label} />
          {/each}
        </Select.Content>
      </Select.Root>

      <FieldLabel for="servone-form-status" class="font-normal">{t('Status')}</FieldLabel>
      <Select.Root
        type="single"
        value={status ?? PROJECT_DEFAULT}
        onValueChange={(picked) => {
          status = statuses.find((candidate) => candidate._id === picked)?._id ?? null
          touch()
        }}
      >
        <Select.Trigger id="servone-form-status" class="w-full">{statusLabel}</Select.Trigger>
        <Select.Content>
          <Select.Item value={PROJECT_DEFAULT} label={t('ProjectDefaultStatus')} />
          {#each statuses as candidate (candidate._id)}
            <Select.Item value={candidate._id} label={candidate.name} />
          {/each}
        </Select.Content>
      </Select.Root>

      <FieldLabel for="servone-form-assignee" class="font-normal">{t('Assignee')}</FieldLabel>
      <Select.Root
        type="single"
        value={assignee ?? NONE}
        onValueChange={(picked) => {
          assignee = people.find((candidate) => candidate._id === picked)?._id ?? null
          touch()
        }}
      >
        <Select.Trigger id="servone-form-assignee" class="w-full">{assigneeLabel}</Select.Trigger>
        <Select.Content>
          <Select.Item value={NONE} label={t('Unassigned')} />
          {#each people as candidate (candidate._id)}
            <Select.Item value={candidate._id} label={formatName(candidate.name)} />
          {/each}
        </Select.Content>
      </Select.Root>

      <FieldLabel for="servone-form-labels" class="font-normal">{t('FormLabels')}</FieldLabel>
      <Select.Root
        type="multiple"
        value={labels}
        onValueChange={(picked) => {
          labels = labelChoices.filter((candidate) => picked.includes(candidate._id)).map((candidate) => candidate._id)
          touch()
        }}
      >
        <Select.Trigger id="servone-form-labels" class="w-full"><span class="truncate">{labelsLabel}</span></Select.Trigger>
        <Select.Content>
          {#each labelChoices as candidate (candidate._id)}
            <Select.Item value={candidate._id} label={candidate.title} />
          {/each}
        </Select.Content>
      </Select.Root>

      <FieldLabel for="servone-form-priority" class="font-normal">{t('Priority')}</FieldLabel>
      {#if hasPriorityQuestion}
        <p id="servone-form-priority" class="m-0 text-sm text-muted-foreground">{t('FromAnswer')}</p>
      {:else}
        <Select.Root
          type="single"
          value={String(priority)}
          onValueChange={(picked) => {
            priority = PRIORITY_TEXT.find(([value]) => String(value) === picked)?.[0] ?? IssuePriority.NoPriority
            touch()
          }}
        >
          <Select.Trigger id="servone-form-priority" class="w-full">{priorityLabel}</Select.Trigger>
          <Select.Content>
            {#each PRIORITY_TEXT as [value, key] (value)}
              <Select.Item value={String(value)} label={t(key)} />
            {/each}
          </Select.Content>
        </Select.Root>
      {/if}
    </div>
  </section>

  <div class="flex items-center gap-3">
    <Button size="sm" disabled={isSaving} onclick={() => { void save() }}>{t('SaveForm')}</Button>
    {#if isSaved}
      <span class="text-sm text-muted-foreground">{t('FormSaved')}</span>
    {/if}
    {#if problem !== undefined && problem.field === undefined}
      <span class="text-sm text-destructive">{t(DEFINITION_PROBLEM_TEXT[problem.problem])}</span>
    {/if}
  </div>

  <section class="grid gap-2 border-t pt-6">
    <div class="grid gap-1">
      <h3 class="m-0 text-sm font-semibold">{t('PublicLink')}</h3>
      <p class="m-0 text-sm text-muted-foreground">{t('PublicLinkHint')}</p>
    </div>
    {#if savedForm === undefined}
      <p class="m-0 text-sm text-muted-foreground">{t('PublicLinkNeedsSave')}</p>
    {:else if linkState === 'unavailable'}
      <p class="m-0 text-sm text-muted-foreground">{t('PublicLinkUnavailable')}</p>
    {:else if linkState === 'failed'}
      <p class="m-0 text-sm text-destructive">{t('PublicLinkFailed')}</p>
    {:else if linkState === 'ready' && link === undefined}
      <div>
        <Button size="sm" variant="outline" onclick={() => { void runLink(async () => await createFormLink(form._id)) }}>
          {t('CreatePublicLink')}
        </Button>
      </div>
    {:else if linkState === 'ready' && link !== undefined}
      {@const url = link.url}
      <div class="flex flex-wrap items-center gap-2">
        <Input class="min-w-64 flex-1" readonly value={url} aria-label={t('PublicLink')} />
        <Button size="sm" variant="outline" onclick={() => { copy(url) }}>{isCopied ? t('LinkCopied') : t('CopyLink')}</Button>
        <Button
          size="sm"
          variant="ghost"
          onclick={() => { confirmLink('ReplaceLink', 'ReplaceLinkConfirm', async () => await createFormLink(form._id)) }}
        >
          {t('ReplaceLink')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onclick={() => {
            confirmLink('TurnOffLink', 'TurnOffLinkConfirm', async () => {
              await deleteFormLink(form._id)
              return undefined
            })
          }}
        >
          {t('TurnOffLink')}
        </Button>
      </div>
    {/if}
  </section>
</div>
