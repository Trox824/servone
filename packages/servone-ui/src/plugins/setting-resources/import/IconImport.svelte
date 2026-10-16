<script lang="ts">
  import type { IconSize } from '@hcengineering/ui'
  import { Import } from '@lucide/svelte'

  export let size: IconSize
</script>

<Import class="svg-{size}" strokeWidth={1.75} />
