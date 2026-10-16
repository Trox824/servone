<!-- Questions of a form template inside the upstream Create issue dialog; the dialog calls the dispatched hook on save. -->
<script lang="ts">
  import type { DocData, Markup, Ref, TxOperations } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { jsonToMarkup, markupToJSON } from '@hcengineering/text-core'
  import tracker, { type Issue, type IssueTemplate, type Project } from '@hcengineering/tracker'
  import { translate } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/ui'
  import {
    ANSWERS_ATTR,
    answerLimit,
    checkAnswers,
    composeDescription,
    fillIssue,
    recordAnswers,
    serializeFormRecord,
    templateForm,
    viaFormLabel,
    writeFormExtras,
    type FormDefinition,
    type FormField,
    type IssueFill
  } from '@servone/forms'
  import { createEventDispatcher } from 'svelte'
  import { Input } from '../../../../lib/components/ui/input'
  import { Label as FieldLabel } from '../../../../lib/components/ui/label'
  import * as Select from '../../../../lib/components/ui/select'
  import { Textarea } from '../../../../lib/components/ui/textarea'
  import { ANSWER_PROBLEM_TEXT, missingRequired } from '../builder'
  import { str } from '../../sprints/plugin'
  import { loadFormText, type FormText } from '../text'

  interface FormHook {
    isComplete: boolean
    hasAnswers: boolean
    titleLabel: string | undefined
    missingHint: string | undefined
    fill: (value: DocData<Issue>, description: Markup) => Markup
    save: (ops: TxOperations, issue: Ref<Issue>, space: Ref<Project>) => Promise<void>
  }

  export let template: IssueTemplate | undefined

  const client = getClient()
  const dispatch = createEventDispatcher<{ change: FormHook | undefined }>()

  let t: FormText = (key) => key
  $: void loadFormText(['Form', 'ChooseOption', ...Object.values(ANSWER_PROBLEM_TEXT)], $themeStore.language).then(
    (loaded) => (t = loaded)
  )

  function answerable (definition: FormDefinition | undefined): FormDefinition | undefined {
    if (definition === undefined) return undefined
    return { ...definition, fields: definition.fields.filter((field) => field.target.to !== 'title') }
  }

  $: fullDefinition = template === undefined ? undefined : templateForm(template)
  $: definition = answerable(fullDefinition)
  $: titleField = fullDefinition?.fields.find((field) => field.target.to === 'title')
  let typed = new Map<string, string>()
  $: forget(template?._id)
  function forget (_template: Ref<IssueTemplate> | undefined): void {
    typed = new Map()
  }

  $: checked = definition === undefined ? undefined : checkAnswers(definition, typed)
  $: problems = checked?.isValid === false ? checked.problems : new Map()
  $: missing = definition === undefined ? undefined : missingRequired(definition, problems, $themeStore.language)
  let missingHint: string | undefined
  $: void hintFor(missing, $themeStore.language).then((hint) => (missingHint = hint))
  async function hintFor (fields: string | undefined, language: string): Promise<string | undefined> {
    return fields === undefined ? undefined : await translate(str.FillToCreate, { fields }, language)
  }
  $: dispatch('change', checked === undefined ? undefined : hook(checked.isValid, missingHint))

  function hook (isComplete: boolean, hint: string | undefined): FormHook {
    let pending: IssueFill | undefined
    return {
      isComplete,
      hasAnswers: [...typed.values()].some((text) => text.trim() !== ''),
      titleLabel: titleField?.label,
      missingHint: hint,
      fill: (value, description) => {
        if (checked?.isValid !== true) return description
        const targetClass = client.getModel().findObject(value.kind)?.targetClass ?? tracker.class.Issue
        pending = fillIssue(client.getHierarchy(), targetClass, checked.answers)
        if (pending.priority !== undefined) value.priority = pending.priority
        if (pending.dueDate !== undefined) value.dueDate = pending.dueDate
        if (template !== undefined && fullDefinition !== undefined) {
          const titled = titleField === undefined ? [] : [{ field: titleField, value: { type: 'text' as const, text: value.title } }]
          const record = recordAnswers(fullDefinition, [...checked.answers, ...titled], template._id, Date.now())
          Object.assign(value, { [ANSWERS_ATTR]: serializeFormRecord(record) })
        }
        return jsonToMarkup(composeDescription(pending, markupToJSON(description).content ?? []))
      },
      save: async (ops, issue, space) => {
        if (pending === undefined) return
        await writeFormExtras(ops, issue, space, pending, await viaFormLabel(ops))
      }
    }
  }

  function answer (field: FormField, text: string): void {
    typed = new Map(typed).set(field.id, text)
  }

  $: problemText = (field: FormField): string | undefined => {
    const problem = problems.get(field.id)
    return problem === undefined || problem === 'required' ? undefined : t(ANSWER_PROBLEM_TEXT[problem])
  }
</script>

{#if definition !== undefined && definition.fields.length > 0}
  <div class="grid gap-3 px-4 py-3">
    <h3 class="m-0 text-sm font-medium">{t('Form')}</h3>
    {#each definition.fields as field (field.id)}
      {@const id = `servone-form-${field.id}`}
      {@const problem = problemText(field)}
      <div class="grid gap-1">
        <FieldLabel for={id}>
          {field.label}{#if field.isRequired}<span class="text-destructive">*</span>{/if}
        </FieldLabel>
        {#if field.help !== undefined && field.help !== ''}
          <p class="m-0 text-xs text-muted-foreground">{field.help}</p>
        {/if}
        {#if field.kind === 'longText'}
          <Textarea
            {id}
            value={typed.get(field.id) ?? ''}
            maxlength={answerLimit(field)}
            aria-invalid={problem !== undefined}
            oninput={(ev) => { answer(field, ev.currentTarget.value) }}
          />
        {:else if field.kind === 'select'}
          {@const picked = typed.get(field.id) ?? ''}
          <Select.Root type="single" value={picked} onValueChange={(option) => { answer(field, option) }}>
            <Select.Trigger {id} class="w-full" aria-invalid={problem !== undefined}>
              {picked === '' ? t('ChooseOption') : picked}
            </Select.Trigger>
            <!-- The scroll lock sets body pointer-events: none, so clicks fell through to Huly's popup overlay and closed the dialog. -->
            <Select.Content preventScroll={false}>
              {#each field.options ?? [] as option (option)}
                <Select.Item value={option} label={option} />
              {/each}
            </Select.Content>
          </Select.Root>
        {:else}
          <Input
            {id}
            type={field.kind === 'date' ? 'date' : field.kind === 'email' ? 'email' : 'text'}
            inputmode={field.kind === 'number' ? 'decimal' : undefined}
            value={typed.get(field.id) ?? ''}
            maxlength={answerLimit(field)}
            aria-invalid={problem !== undefined}
            oninput={(ev) => { answer(field, ev.currentTarget.value) }}
          />
        {/if}
        {#if problem !== undefined}
          <p class="m-0 text-xs text-destructive">{problem}</p>
        {/if}
      </div>
    {/each}
  </div>
{/if}
