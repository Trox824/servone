<!--
  Pass-through to the unmodified original: its resize logic is load-bearing for every split panel.
  Hover accent is hardcoded upstream as var(--primary-button-default) and cannot be overridden here.
-->
<script lang="ts">
  import type { SeparatedItem } from '../original'
  import { Separator as HulySeparator } from '../original'

  export let prevElementSize: SeparatedItem | undefined = undefined
  export let nextElementSize: SeparatedItem | undefined = undefined
  export let separatorSize: number = 1
  export let color: string = 'var(--border)'
  export let name: string
  export let disabledWhen: string[] = []
  export let index: number
  export let float: string | boolean = false
  export let short: boolean = false
</script>

<HulySeparator
  {prevElementSize}
  {nextElementSize}
  {separatorSize}
  {color}
  {name}
  {disabledWhen}
  {index}
  {float}
  {short}
/>
