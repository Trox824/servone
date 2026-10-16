<script lang="ts">
  import { type IntlString, OK, Severity, Status, translate } from '@hcengineering/platform'
  import { Label, themeStore } from '@hcengineering/ui'
  import { LoaderCircle } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { Button } from '../../../lib/components/ui/button'
  import { Input } from '../../../lib/components/ui/input'
  import { Label as FieldLabel } from '../../../lib/components/ui/label'
  import { type BottomAction } from '..'
  import { makeSequential } from '../mutex'
  import login from '../plugin'
  import type { Field } from '../types'
  import { getHref } from '../utils'
  import BottomActionComponent from './BottomAction.svelte'
  import Providers from './Providers.svelte'
  import StatusControl from './StatusControl.svelte'
  import Tabs from './Tabs.svelte'

  export let caption: IntlString
  export let captionParams: Record<string, any> = {}
  export let status: Status
  export let fields: Field[]
  export let action: { i18n: IntlString, func: () => Promise<void> }
  export let secondaryButtonLabel: IntlString | undefined = undefined
  export let secondaryButtonAction: (() => void) | undefined = undefined
  export let bottomActions: BottomAction[] = []
  export let object: any
  export let ignoreInitialValidation: boolean = false
  export let withProviders: boolean = false
  export let subtitle: string | undefined = undefined
  export let signUpDisabled: boolean = false
  export let isLoading: boolean = false
  export let actionButtonDataId: string | undefined = undefined
  export let secondaryButtonDataId: string | undefined = undefined

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const invalidEmailMessage = 'login:string:ServoneInvalidEmail' as IntlString

  let isActionRunning = false
  let hasUserTyped = false

  const validateForm = makeSequential(async (): Promise<boolean> => {
    if (ignoreInitialValidation || isLoading) return true
    const language = $themeStore.language

    for (const field of fields) {
      const fieldValue: string | undefined | null = object[field.name]
      const trimmedValue = (fieldValue ?? '').trim()
      const fieldLabel = await translate(field.i18n, {}, language)

      if (field.optional !== true && trimmedValue === '') {
        status = new Status(Severity.INFO, login.status.RequiredField, { field: fieldLabel })
        return false
      }

      if (field.name === 'username' && !EMAIL_PATTERN.test(trimmedValue)) {
        status = new Status(Severity.INFO, invalidEmailMessage, {})
        return false
      }

      if (field.id !== undefined) {
        for (const sibling of fields) {
          if (sibling === field || sibling.id !== field.id) continue
          if (object[sibling.name] !== fieldValue) {
            const siblingLabel = await translate(sibling.i18n, {}, language)
            status = new Status(Severity.INFO, login.status.FieldsDoNotMatch, {
              field: siblingLabel,
              field2: fieldLabel
            })
            return false
          }
        }
      }

      for (const fieldRule of field.rules ?? []) {
        const isMatch = typeof fieldRule.rule === 'function' ? fieldRule.rule(trimmedValue) : fieldRule.rule.test(trimmedValue)
        if (isMatch === fieldRule.notMatch) {
          status = new Status(Severity.INFO, fieldRule.ruleDescr, fieldRule.ruleDescrParams ?? {})
          return false
        }
      }
    }

    status = OK
    return true
  })

  export function invalidate (): void {
    void validateForm()
  }

  function trimField (fieldName: string): void {
    const fieldValue: string | undefined | null = object[fieldName]
    object[fieldName] = (fieldValue ?? '').trim()
  }

  async function submitForm (): Promise<void> {
    if (isActionRunning) return
    const isValid = await validateForm()
    if (!isValid) return
    for (const field of fields) trimField(field.name)
    isActionRunning = true
    try {
      await action.func()
    } finally {
      isActionRunning = false
    }
  }

  function handleNativeSubmit (event: SubmitEvent): void {
    event.preventDefault()
    void submitForm()
  }

  function handleFormKeydown (event: KeyboardEvent): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    event.stopPropagation()
    void submitForm()
  }

  function runSecondaryAction (event: MouseEvent): void {
    event.preventDefault()
    secondaryButtonAction?.()
  }

  function followRecoveryLink (event: MouseEvent): void {
    event.preventDefault()
    passwordRecoveryAction?.func()
  }

  function getInputType (field: Field): 'password' | 'email' | 'text' {
    if (field.password === true) return 'password'
    return field.id === 'email' ? 'email' : 'text'
  }

  $: uiLanguage = $themeStore.language
  $: if (uiLanguage !== undefined && uiLanguage !== '') void validateForm()

  $: isTabsHeader = !signUpDisabled && (caption === login.string.LogIn || caption === login.string.SignUp)
  $: tabsState = caption === login.string.LogIn ? 'login' : 'signup'
  $: firstPasswordFieldName = fields.find((field) => field.password === true)?.name
  $: passwordRecoveryAction =
    firstPasswordFieldName === undefined ? undefined : bottomActions.find((candidate) => candidate.page === 'password')
  $: footerActions = bottomActions.filter((candidate) => candidate !== passwordRecoveryAction)
  $: isStatusVisible =
    status.severity !== Severity.OK && !(status.code === login.status.RequiredField && !hasUserTyped)
  $: isPrimaryDisabled =
    isActionRunning || (status.severity !== Severity.OK && status.severity !== Severity.ERROR)

  onMount(() => {
    ignoreInitialValidation = false
  })
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
  class="flex flex-col gap-6"
  on:submit={handleNativeSubmit}
  on:keydown={handleFormKeydown}
  on:input={() => {
    hasUserTyped = true
  }}
>
  {#if isTabsHeader}
    <Tabs loginState={tabsState} {signUpDisabled} />
  {:else}
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <h1 class="text-lg font-semibold leading-none tracking-tight">
          <Label label={caption} params={captionParams} />
        </h1>
        <slot name="region-selector" />
      </div>
      {#if subtitle !== undefined}
        <p class="text-sm text-muted-foreground">{subtitle}</p>
      {/if}
    </div>
  {/if}

  <div class="grid grid-cols-2 gap-x-3 gap-y-4">
    {#each fields as field (field.name)}
      <div class={field.short === true ? 'col-span-2 flex flex-col gap-2 sm:col-span-1' : 'col-span-2 flex flex-col gap-2'}>
        <div class="flex items-center">
          <FieldLabel for={`login-${field.name}`}><Label label={field.i18n} /></FieldLabel>
          {#if passwordRecoveryAction !== undefined && field.name === firstPasswordFieldName}
            <a
              href={getHref('password')}
              class="ml-auto text-sm underline-offset-4 hover:underline"
              on:click={followRecoveryLink}
            >
              <Label label={passwordRecoveryAction.caption ?? passwordRecoveryAction.i18n} />
            </a>
          {/if}
        </div>
        <Input
          id={`login-${field.name}`}
          name={field.id}
          autocomplete={field.id}
          type={getInputType(field)}
          disabled={isActionRunning || field.disabled === true}
          bind:value={object[field.name]}
          oninput={() => validateForm()}
          onblur={() => trimField(field.name)}
        />
      </div>
    {/each}
    <slot name="extra-fields" />

    {#if isStatusVisible}
      <div class="col-span-2"><StatusControl {status} /></div>
    {/if}

    <div class="col-span-2 flex flex-col gap-3">
      <Button type="submit" class="w-full" data-id={actionButtonDataId} disabled={isPrimaryDisabled}>
        {#if isActionRunning}
          <LoaderCircle class="animate-spin" />
        {/if}
        <Label label={action.i18n} />
      </Button>
      {#if secondaryButtonLabel !== undefined && secondaryButtonAction !== undefined}
        <Button
          type="button"
          variant="outline"
          class="w-full"
          data-id={secondaryButtonDataId}
          onclick={runSecondaryAction}
        >
          <Label label={secondaryButtonLabel} />
        </Button>
      {/if}
    </div>
  </div>

  {#if withProviders}
    <Providers />
  {/if}

  {#if footerActions.length > 0}
    <div class="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
      {#each footerActions as footerAction}
        <BottomActionComponent action={footerAction} />
      {/each}
    </div>
  {/if}
</form>
