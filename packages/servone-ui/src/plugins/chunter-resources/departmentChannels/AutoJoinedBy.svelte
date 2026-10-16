<script lang="ts">
  import type { Channel } from '@hcengineering/chunter'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import { DEPARTMENT_CLASS, type DepartmentWithChannels } from '../../hr-resources/departmentChannels/setup'

  export let channel: Channel

  const AUTO_JOINED_BY = 'chunter:string:ServoneAutoJoinedBy' as IntlString
  const EVERYONE = 'chunter:string:ServoneEveryone' as IntlString

  let departments: DepartmentWithChannels[] = []
  const departmentsQuery = createQuery()
  $: departmentsQuery.query(DEPARTMENT_CLASS, {}, (found) => {
    departments = found
  })

  $: names = departments
    .filter((department) => department.servoneDefaultChannels?.includes(channel._id) === true)
    .map((department) => department.name)
    .sort((a, b) => a.localeCompare(b))
  $: isEveryone = channel.autoJoin === true
</script>

{#if isEveryone || names.length > 0}
  <span class="text-sm content-dark-color">
    <Label label={AUTO_JOINED_BY} />:
    {#if isEveryone}<Label label={EVERYONE} />{#if names.length > 0},{/if}{/if}
    {names.join(', ')}
  </span>
{/if}
