<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { Card } from '@hcengineering/presentation'
  import type { Request } from '@hcengineering/request'
  import { Label } from '@hcengineering/ui'
  import { MIN_REASON_LENGTH } from '@servone/approvals/src/gate'
  import { createEventDispatcher } from 'svelte'
  import { ServiceApiError } from '../../chunter-resources/webhooks/api'
  import { decide, decisionErrorLabel, isReasonLongEnough } from '../approvals'
  import { str } from '../strings'

  export let request: Ref<Request>

  const dispatch = createEventDispatcher()

  let reason = ''
  let error: IntlString | undefined
  let isRefused = false

  async function reject (): Promise<void> {
    error = undefined
    try {
      await decide(request, 'reject', reason)
    } catch (err) {
      isRefused = true
      error = err instanceof ServiceApiError ? decisionErrorLabel(err.code) : str.ErrorUnknown
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
  label={str.RejectTitle}
  okLabel={str.Reject}
  okAction={reject}
  canSave={isReasonLongEnough(reason)}
  width={'small'}
  gap={'gapV-2'}
  on:close={close}
  on:changeContent
>
  <label class="field">
    <span class="field__label"><Label label={str.Reason} /></span>
    <!-- svelte-ignore a11y-autofocus -->
    <textarea class="field__input" rows="4" bind:value={reason} autofocus />
  </label>
  <div class="hint">
    <Label label={str.ReasonHint} />
    <span class:is-short={!isReasonLongEnough(reason)}>
      <Label label={str.ReasonCount} params={{ count: reason.trim().length, min: MIN_REASON_LENGTH }} />
    </span>
  </div>
  <svelte:fragment slot="error">
    {#if error !== undefined}
      <Label label={error} />
    {/if}
  </svelte:fragment>
</Card>

<style lang="scss">
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;

    &__label {
      font-weight: 500;
      color: var(--theme-caption-color);
    }

    &__input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--theme-button-border);
      border-radius: 0.5rem;
      background: transparent;
      color: var(--theme-caption-color);
      font: inherit;
      resize: vertical;

      &:focus {
        outline: 2px solid var(--primary-button-default);
        outline-offset: -1px;
      }
    }
  }

  .hint {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--theme-dark-color);

    .is-short {
      color: var(--theme-halfcontent-color);
    }
  }
</style>
