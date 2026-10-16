<!-- The item's form questions: the answers it was filed with, editable in place while the item is. -->
<script lang="ts">
  import { SortingOrder } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { translate } from '@hcengineering/platform'
  import { Label, themeStore } from '@hcengineering/ui'
  import {
    answerHref,
    formTemplateClass,
    parseFormRecord,
    serializeFormRecord,
    type FormIssue,
    type FormTemplate
  } from '@servone/forms'
  import { str } from '../../sprints/plugin'
  import { str as workflowStr } from '../../workflows/plugin'
  import { detailRows, isMissing, itemForm, withAnswer, type DetailRow } from '../details'

  export let issue: FormIssue
  export let readonly: boolean
  export let missing: string[] = []

  const client = getClient()

  let section: HTMLElement | null = null
  let placeholders = new Map<string, string>()
  let templates: FormTemplate[] = []
  const templatesQuery = createQuery()
  $: templatesQuery.query(
    formTemplateClass,
    { space: issue.space },
    (found) => {
      templates = found
    },
    { sort: { title: SortingOrder.Ascending } }
  )

  $: record = parseFormRecord(issue.servoneFormAnswers)
  $: form = itemForm(templates, record)
  $: rows = detailRows(form, record, issue.title)
  $: missing = rows.filter(isMissing).map((row) => row.answer.label)
  $: void Promise.all(
    rows.map(async (row) => [row.answer.id, await translate(workflowStr.AddField, { label: row.answer.label }, $themeStore.language)] as const)
  ).then((pairs) => {
    placeholders = new Map(pairs)
  })

  export function focusMissing (): void {
    const field = section?.querySelector<HTMLElement>('[data-missing]')
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    field?.focus({ preventScroll: true })
  }

  function save (row: DetailRow, text: string): void {
    const trimmed = text.trim()
    if (form === undefined || trimmed === row.answer.text) return
    const updated = withAnswer(record, form, issue.createdOn ?? issue.modifiedOn, row.answer.id, trimmed)
    void client.update(issue, { servoneFormAnswers: serializeFormRecord(updated) })
  }
</script>

{#if rows.length > 0}
  <section class="request-details" bind:this={section}>
    <h2 class="request-details__title"><Label label={str.RequestDetails} /></h2>
    <dl class="request-details__grid">
      {#each rows as row (row.answer.id)}
        {@const answer = row.answer}
        {@const field = row.field}
        {@const href = answerHref(answer)}
        <dt>
          {answer.label}
          {#if isMissing(row)}
            <span class="request-details__required"><Label label={workflowStr.Required} /></span>
          {/if}
        </dt>
        <dd class:request-details__long={answer.kind === 'longText'}>
          {#if field !== undefined && !readonly}
            {#if field.kind === 'longText'}
              <textarea
                class="request-details__input"
                rows="3"
                value={answer.text}
                placeholder={placeholders.get(answer.id)}
                data-missing={isMissing(row) ? '' : undefined}
                aria-label={answer.label}
                on:change={(ev) => { save(row, ev.currentTarget.value) }}
              />
            {:else if field.kind === 'select'}
              <select
                class="request-details__input"
                class:is-empty={answer.text === ''}
                value={answer.text}
                data-missing={isMissing(row) ? '' : undefined}
                aria-label={answer.label}
                on:change={(ev) => { save(row, ev.currentTarget.value) }}
              >
                <option value="">{placeholders.get(answer.id) ?? ''}</option>
                {#each field.options ?? [] as option (option)}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            {:else}
              <input
                class="request-details__input"
                type={field.kind}
                value={answer.text}
                placeholder={placeholders.get(answer.id)}
                data-missing={isMissing(row) ? '' : undefined}
                aria-label={answer.label}
                on:change={(ev) => { save(row, ev.currentTarget.value) }}
              />
            {/if}
          {:else if answer.text === ''}
            <span class="request-details__empty">—</span>
          {:else if href !== undefined}
            <a {href} target={answer.kind === 'email' ? undefined : '_blank'} rel="noopener noreferrer">{answer.text}</a>
          {:else}
            {answer.text}
          {/if}
        </dd>
      {/each}
    </dl>
  </section>
{/if}

<style>
  .request-details {
    margin: 1.25rem 0 1.5rem;
  }

  .request-details__title {
    margin: 0 0 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--muted-foreground);
  }

  .request-details__grid {
    display: grid;
    grid-template-columns: 9rem minmax(0, 1fr);
    align-items: start;
    column-gap: 1rem;
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.25rem;
  }

  dt,
  dd {
    display: flex;
    align-items: center;
    min-height: 2rem;
    margin: 0;
    overflow-wrap: anywhere;
  }

  dt {
    flex-wrap: wrap;
    column-gap: 0.375rem;
    color: var(--muted-foreground);
  }

  dd {
    color: var(--foreground);
  }

  .request-details__long {
    white-space: pre-wrap;
  }

  .request-details__required {
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--theme-button-warning-color);
  }

  /* Borderless at rest like Linear properties; the negative margin keeps the text in line with read-only values. */
  .request-details__input {
    width: calc(100% + 0.5rem);
    margin-left: -0.5rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .request-details__input:hover {
    border-color: var(--border);
    background: var(--accent);
  }
  .request-details__input:focus {
    border-color: var(--border);
    outline: 2px solid var(--ring);
    outline-offset: -1px;
  }
  .request-details__input::placeholder,
  .request-details__input.is-empty {
    color: var(--muted-foreground);
  }

  textarea.request-details__input {
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
    resize: vertical;
  }

  .request-details__empty {
    color: var(--muted-foreground);
  }

  a {
    color: var(--theme-link-color);
    text-underline-offset: 0.15em;
  }
</style>
