<!--
  @servone/ui shadow (webpack NormalModuleReplacementPlugin, see dev/prod/webpack.config.js). Renders nothing:
  every Tracker page header already has "New issue" (drafts resume there), so upstream's navigator button was a duplicate.
-->
<script lang="ts">
  import type { Ref, Space } from '@hcengineering/core'

  export let currentSpace: Ref<Space> | undefined = undefined
  export let currentSpecial: string | undefined = undefined
  export let currentFragment: string | undefined = undefined
  $: void currentSpace
  $: void currentSpecial
  $: void currentFragment
</script>
