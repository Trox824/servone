<!--
  Shadow of plugins/text-editor-resources/src/components/icons/Send.svelte (webpack
  NormalModuleReplacementPlugin, dev/prod/webpack.config.js). Same props as upstream (`size`, `fill`).
-->
<script lang="ts">
  import { SendHorizontal } from '@lucide/svelte'

  export let size: 'small' | 'medium' | 'large'
  export let fill: string = 'currentColor'
</script>

<SendHorizontal
  class="svg-{size}"
  strokeWidth={2}
  aria-hidden="true"
  style="color: {fill === 'currentColor' ? 'inherit' : fill}"
/>
