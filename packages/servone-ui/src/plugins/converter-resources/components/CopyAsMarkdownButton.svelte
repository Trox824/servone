<script lang="ts">
  import type { Class, Doc, DocumentQuery, Ref } from '@hcengineering/core'
  import type { BuildModelKey } from '@hcengineering/view'

  export let _class: Ref<Class<Doc>>
  export let query: DocumentQuery<Doc> = {}
  export let config: Array<string | BuildModelKey> = []

  $: void [_class, query, config]
</script>
