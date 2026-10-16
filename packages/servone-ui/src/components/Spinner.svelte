<!-- Decorative: the surrounding Loading (role="status") or the busy button carries the announcement. -->
<script lang="ts">
  import type { ButtonSize } from '../original'
  import { LoaderCircle } from '@lucide/svelte'

  export let size: ButtonSize = 'medium'

  const sizeClass: Record<ButtonSize, string> = {
    inline: 'size-3',
    'x-small': 'size-4',
    small: 'size-4',
    medium: 'size-6',
    large: 'size-8',
    'x-large': 'size-12'
  }
</script>

<div class="inline-flex items-center justify-center {sizeClass[size]}" aria-hidden="true">
  <LoaderCircle class="animate-spin text-muted-foreground {sizeClass[size]}" />
</div>
