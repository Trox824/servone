<!-- Lucide Check instead of the kit's 1-unit-thin path, which is blurry at small sizes. -->
<script lang="ts">
  import { Check } from '@lucide/svelte'

  export let size: 'small' | 'medium' | 'large'
  export let fill: string = 'currentColor'

  $: strokeWidth = (size as string) === 'x-small' || (size as string) === 'tiny' ? 2 : 1.75
</script>

<Check class="svg-{size}" {strokeWidth} aria-hidden="true" style="color: {fill === 'currentColor' ? 'inherit' : fill}" />
