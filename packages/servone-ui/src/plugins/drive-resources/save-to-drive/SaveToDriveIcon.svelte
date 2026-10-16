<script lang="ts">
  import { HardDriveUpload } from '@lucide/svelte'

  export let size: 'small' | 'medium' | 'large'
</script>

<HardDriveUpload class="svg-{size}" strokeWidth={1.75} aria-hidden="true" />
