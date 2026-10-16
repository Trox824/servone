<!-- Lucide icon in the kit's Icon contract (size prop, svg-{size} class), for the message action menu. -->
<script lang="ts">
  import { AlarmClock } from '@lucide/svelte'

  export let size: 'small' | 'medium' | 'large'
</script>

<AlarmClock class="svg-{size}" strokeWidth={1.75} aria-hidden="true" />
