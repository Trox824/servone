<script lang="ts">
  import type { Doc, Ref } from '@hcengineering/core'
  import { tooltip } from '../original'
  import { teamDirectory } from '../lib/team-departments'
  import { resolveTeamMembers, teamStrings } from '../lib/team-mentions'

  export let _id: Ref<Doc> | undefined = undefined
  export let title: string = ''
  export let transparent: boolean = false

  const teams = teamDirectory()

  $: team = $teams.departments.find((dept) => dept._id === _id)
  $: handle = (team !== undefined ? $teams.handles.get(team._id) : undefined) ?? title
  $: count = team !== undefined ? resolveTeamMembers(team._id, $teams.departments, { active: $teams.active }).length : 0
</script>

<span
  class="antiMention"
  class:transparent
  use:tooltip={team !== undefined ? { label: teamStrings.MembersTooltip, props: { name: team.name, count } } : undefined}
  >@{handle}</span
>
