<!-- Lucide ArrowRight instead of the kit's 1-unit-thin path, which is blurry at small sizes. -->
<script lang="ts">
  import { ArrowRight } from '@lucide/svelte'

  export let size: 'small' | 'medium' | 'large'

  $: strokeWidth = (size as string) === 'x-small' || (size as string) === 'tiny' ? 2 : 1.75
</script>

<ArrowRight class="svg-{size}" {strokeWidth} aria-hidden="true" />
