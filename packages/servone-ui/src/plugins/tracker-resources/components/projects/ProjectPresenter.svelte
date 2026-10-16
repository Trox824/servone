<script lang="ts">
  import { getCurrentAccount, type Ref } from '@hcengineering/core'
  import presentation, { createQuery, IconWithEmoji, isAdminUser } from '@hcengineering/presentation'
  import type { Project } from '@hcengineering/tracker'
  import { Icon, Label, getPlatformColorDef, getPlatformColorForTextDef, themeStore } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { NavLink } from '@hcengineering/view-resources'
  import tracker from '../../plugin'
  import { isWorkflowType } from '../../workflows/nav'
  import { workflowIcon } from '../../workflows/plugin'

  export let value: Project | Ref<Project> | undefined
  export let inline: boolean = false
  export let accent: boolean = false
  export let colorInherit: boolean = false
  export let openIssues: boolean = false

  const projectQuery = createQuery()
  const currentAccountUuid = getCurrentAccount().uuid

  let fetchedProject: Project | undefined = undefined

  $: projectId = typeof value === 'string' ? value : undefined
  $: if (projectId !== undefined) {
    projectQuery.query(tracker.class.Project, { _id: projectId }, (projects) => {
      fetchedProject = projects[0]
    }, { limit: 1 })
  } else {
    projectQuery.unsubscribe()
    fetchedProject = undefined
  }

  $: project = typeof value === 'object' ? value : fetchedProject

  $: usesEmoji = project?.icon === view.ids.IconWithEmoji
  $: fallbackIcon = project !== undefined && isWorkflowType(project.type) ? workflowIcon : tracker.icon.Home
  $: colorDefinition =
    project === undefined
      ? undefined
      : project.color !== undefined && typeof project.color !== 'string'
        ? getPlatformColorDef(project.color, $themeStore.dark)
        : getPlatformColorForTextDef(project.name, $themeStore.dark)
  $: iconComponent = usesEmoji ? IconWithEmoji : (project?.icon ?? fallbackIcon)
  $: iconProps = usesEmoji ? { icon: project?.color } : { fill: colorDefinition?.icon }
  $: canOpen = openIssues && project !== undefined && (isAdminUser() || project.members.includes(currentAccountUuid))
</script>

{#if project !== undefined}
  <div class="flex-presenter cursor-default" class:inline-presenter={inline} class:colorInherit>
    <div class="icon" class:emoji={usesEmoji}>
      <Icon icon={iconComponent} {iconProps} size={'small'} />
    </div>
    <span class="label no-underline nowrap" class:fs-bold={accent}>
      {#if canOpen}
        <NavLink space={project._id} special={'issues'} noUnderline={false}>{project.name}</NavLink>
      {:else}
        {project.name}
      {/if}
      {#if project.archived}
        <Label label={presentation.string.Archived} />
      {/if}
    </span>
  </div>
{/if}
