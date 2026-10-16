<!-- Lucide Trash instead of the kit's 1-unit-thin path, which is blurry at small sizes. -->
<script lang="ts">
  import { Trash } from '@lucide/svelte'

  export let size: 'x-small' | 'small' | 'medium' | 'large'
  export let fill: string = 'currentColor'

  $: strokeWidth = (size as string) === 'x-small' || (size as string) === 'tiny' ? 2 : 1.75
</script>

<Trash class="svg-{size}" {strokeWidth} aria-hidden="true" style="color: {fill === 'currentColor' ? 'inherit' : fill}" />
