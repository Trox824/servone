<script lang="ts">
  import type { Person } from '@hcengineering/contact'
  import type { Ref } from '@hcengineering/core'
  import PersonAvatar from '../../../calendar-resources/lich/components/PersonAvatar.svelte'

  export let people: Array<Ref<Person>>
  export let max = 5

  $: shown = people.slice(0, max)
  $: more = people.length - shown.length
</script>

<!-- No overlap: overlapped 22px avatars clip their initials (DESIGN.md avatar stack rule). -->
<span class="inline-flex items-center gap-0.5">
  {#each shown as person (person)}
    <PersonAvatar {person} />
  {/each}
  {#if more > 0}
    <span class="bg-muted text-muted-foreground inline-grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums">+{more}</span>
  {/if}
</span>
