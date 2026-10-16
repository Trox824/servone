<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import uiPlugin from '@hcengineering/ui/src/plugin'
  import { Label } from '../original'
  import { cn } from '../lib/utils'

  export let label: IntlString | undefined = undefined
  export let width: string | undefined = undefined
  export let height: string | undefined = undefined
  export let margin: string | undefined = undefined
  export let value: string | undefined = undefined
  export let placeholder: IntlString = uiPlugin.string.EditBoxPlaceholder
  export let placeholderParam: any | undefined = undefined
  export let noFocusBorder: boolean = false
  export let disabled: boolean = false

  let fieldElement: HTMLTextAreaElement | undefined
  let translatedPlaceholder = ''

  $: translateCB(placeholder, placeholderParam ?? {}, $themeStore.language, (translated) => {
    translatedPlaceholder = translated
  })

  export function focus (): void {
    fieldElement?.focus()
  }
</script>

<div
  class="flex min-h-9 min-w-[50px] flex-col"
  style:width
  style:height
  style:margin
>
  {#if label}
    <div class="mb-1 select-none text-xs font-medium text-foreground">
      <Label {label} />
    </div>
  {/if}
  <textarea
    bind:this={fieldElement}
    bind:value
    {disabled}
    placeholder={translatedPlaceholder}
    class={cn(
      'min-h-18 w-full resize-none bg-transparent leading-normal text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
      noFocusBorder
        ? 'border-0 p-0 text-base font-medium'
        : 'rounded-sm border-2 border-transparent p-0.5 text-sm focus:border-primary'
    )}
    on:keydown
    on:change
    on:keypress
    on:blur
  ></textarea>
</div>
