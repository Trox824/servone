<script lang="ts">
  import type { Person } from '@hcengineering/contact'
  import type { Ref } from '@hcengineering/core'
  import { Avatar, getPersonByPersonRefStore } from '@hcengineering/contact-resources'

  export let person: Ref<Person>

  $: people = getPersonByPersonRefStore([person])
  $: found = $people.get(person)
</script>

<!-- Upstream Avatar so a person keeps the photo and color they have everywhere else in the app. -->
<Avatar person={found} name={found?.name} size="x-small" variant="circle" />
