<!-- Lucide Paperclip instead of the kit's 1-unit-thin path, which is blurry at small sizes. -->
<script lang="ts">
  import { Paperclip } from '@lucide/svelte'
  import type { ButtonSize } from '../../original'

  export let size: ButtonSize
  export let fill: string = 'currentColor'

  $: strokeWidth = (size as string) === 'x-small' || (size as string) === 'tiny' ? 2 : 1.75
</script>

<Paperclip class="svg-{size}" {strokeWidth} aria-hidden="true" style="color: {fill === 'currentColor' ? 'inherit' : fill}" />
