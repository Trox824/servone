<script lang="ts">
  import contact, { getCurrentEmployee } from '@hcengineering/contact'
  import type { Ref } from '@hcengineering/core'
  import hr, { type Department } from '@hcengineering/hr'
  import type { IntlString } from '@hcengineering/platform'
  import { Card, createQuery, getClient } from '@hcengineering/presentation'
  import { themeStore } from '@hcengineering/theme'
  import { EditBox, getCurrentLocation, Label, navigate } from '@hcengineering/ui'
  import { ObjectBox } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'
  import { profileDepartment, staffDepartmentOf } from '../../../../lib/profile-department'
  import { ServiceApiError } from '../../../chunter-resources/webhooks/api'
  import { createErrorLabel, createWorkflow, WORKFLOW_TEMPLATES, type WorkflowTemplateKey } from '../create'
  import { str, WORKFLOW_APP_ALIAS } from '../plugin'

  const dispatch = createEventDispatcher()
  const client = getClient()
  const me = getCurrentEmployee()

  let name = ''
  let department: Ref<Department> | undefined
  let template: WorkflowTemplateKey = WORKFLOW_TEMPLATES[0].key
  let error: IntlString | undefined
  let isRefused = false

  const departmentQuery = createQuery()
  departmentQuery.query(hr.class.Department, {}, async (departments) => {
    if (department !== undefined) return
    const employee = await client.findOne(contact.mixin.Employee, { _id: me })
    const staffDepartment = employee !== undefined ? staffDepartmentOf(client.getHierarchy(), employee) : undefined
    department ??= profileDepartment(me, staffDepartment, departments)?._id
  })

  $: canSave = name.trim() !== '' && department !== undefined

  async function create (): Promise<void> {
    if (department === undefined) return
    error = undefined
    try {
      const project = await createWorkflow({
        name: name.trim(),
        department,
        template,
        language: $themeStore.language === 'en' ? 'en' : 'vi'
      })
      const loc = getCurrentLocation()
      loc.path = [loc.path[0], loc.path[1], WORKFLOW_APP_ALIAS, project, 'items']
      loc.fragment = undefined
      loc.query = undefined
      navigate(loc)
    } catch (err) {
      isRefused = true
      error = err instanceof ServiceApiError ? createErrorLabel(err.code) : str.ErrorUnknown
    }
  }

  function close (): void {
    if (isRefused) {
      isRefused = false
      return
    }
    dispatch('close')
  }
</script>

<Card
  label={str.NewWorkflow}
  okLabel={str.Create}
  okAction={create}
  {canSave}
  accentHeader
  width={'medium'}
  gap={'gapV-4'}
  on:close={close}
  on:changeContent
>
  <div class="antiGrid">
    <div class="antiGrid-row">
      <div class="antiGrid-row__header">
        <Label label={str.WorkflowName} />
      </div>
      <EditBox bind:value={name} placeholder={str.WorkflowNamePlaceholder} kind={'default'} autoFocus />
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header">
        <Label label={str.Department} />
      </div>
      <ObjectBox
        _class={hr.class.Department}
        label={str.Department}
        bind:value={department}
        kind={'regular'}
        size={'large'}
        width={'100%'}
        justify={'left'}
        showNavigate={false}
      />
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header topAlign">
        <Label label={str.Template} />
      </div>
      <div class="templates" role="radiogroup">
        {#each WORKFLOW_TEMPLATES as option (option.key)}
          <button
            type="button"
            role="radio"
            aria-checked={template === option.key}
            class="template"
            class:selected={template === option.key}
            on:click={() => (template = option.key)}
          >
            <span class="template__name"><Label label={option.label} /></span>
            <span class="template__hint"><Label label={option.hint} /></span>
          </button>
        {/each}
      </div>
    </div>
  </div>
  <svelte:fragment slot="error">
    {#if error !== undefined}
      <Label label={error} />
    {/if}
  </svelte:fragment>
</Card>

<style lang="scss">
  .templates {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 1fr;
    gap: 0.5rem;
    flex-grow: 1;
  }

  .template {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 0.625rem 0.75rem;
    text-align: left;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.5rem;
    background: transparent;
    cursor: pointer;

    &:hover {
      background: var(--theme-button-hovered);
    }

    &.selected {
      border-color: var(--primary-bg-color);
    }

    &:focus-visible {
      outline: 1px solid var(--primary-bg-color);
      outline-offset: 1px;
    }

    &__name {
      font-weight: 500;
      color: var(--theme-caption-color);
    }

    &__hint {
      font-size: 0.75rem;
      line-height: 1.3;
      color: var(--theme-dark-color);
    }
  }
</style>
