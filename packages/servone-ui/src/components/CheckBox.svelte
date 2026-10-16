<!--
  `value` dispatches only on user interaction (onCheckedChange), never on prop updates, like upstream.
  Call sites never label a CheckBox, so it falls back to view "Select"; string ids are literals to avoid a view dependency.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { Checkbox } from '../lib/components/ui/checkbox'
  import { Label } from '../lib/components/ui/label'
  import { cn } from '../lib/utils'

  export let checked: boolean = false
  export let symbol: 'check' | 'minus' = 'check'
  export let size: 'small' | 'medium' | 'large' = 'small'
  export let circle: boolean = false
  export let kind: 'default' | 'primary' | 'positive' | 'negative' | 'todo' = 'default'
  export let color: string | undefined = undefined
  export let readonly: boolean = false
  export let disabled: boolean = false
  export let ariaLabel: IntlString | undefined = undefined

  let ariaLabelText: string | undefined = undefined
  $: translateCB(ariaLabel ?? ('view:string:Select' as IntlString), {}, $themeStore.language, (res) => {
    ariaLabelText = res
  })

  const dispatch = createEventDispatcher()

  function handleCheckedChange (v: boolean): void {
    if (readonly) return
    checked = v
    dispatch('value', v)
  }

  const sizeClass: Record<string, string> = {
    small: 'size-3.5',
    medium: 'size-4',
    large: 'size-5'
  }
  const kindClass: Record<string, string> = {
    default: 'data-[state=checked]:bg-primary data-[state=checked]:border-primary',
    primary: 'data-[state=checked]:bg-primary data-[state=checked]:border-primary',
    positive: 'data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600',
    negative: 'data-[state=checked]:bg-destructive data-[state=checked]:border-destructive',
    todo: 'rounded-full border-muted-foreground'
  }
</script>

<Label
  class={cn('inline-flex items-center justify-center', disabled ? 'pointer-events-none opacity-50' : !readonly && 'cursor-pointer')}
  onclick={(e: MouseEvent) => e.stopPropagation()}
>
  <Checkbox
    {checked}
    aria-label={ariaLabelText}
    indeterminate={symbol === 'minus'}
    {readonly}
    disabled={readonly || disabled}
    onCheckedChange={handleCheckedChange}
    style={color ? `--checkbox-color: ${color}` : undefined}
    class={cn(
      sizeClass[size],
      circle && 'rounded-full',
      kindClass[kind],
      color && 'data-[state=checked]:bg-[var(--checkbox-color)] data-[state=checked]:border-[var(--checkbox-color)]'
    )}
  />
</Label>
