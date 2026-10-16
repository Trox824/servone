<script lang="ts">
  export let error: any

  $: detailsJson = JSON.stringify(error.status?.params ? error.status.params : error, undefined, 2)
</script>

<div class="text-sm text-foreground">
  {error.message}
  <pre class="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs text-muted-foreground">{detailsJson}</pre>
</div>
