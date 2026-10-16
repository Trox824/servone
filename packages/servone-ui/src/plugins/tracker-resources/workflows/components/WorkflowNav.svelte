<!-- Linear-style: departments fold, the open workflow shows its pages beneath it. -->
<script lang="ts">
  import { AccountRole, getCurrentAccount, hasAccountRole, type Ref, type Space } from '@hcengineering/core'
  import hr, { type Department } from '@hcengineering/hr'
  import { createQuery } from '@hcengineering/presentation'
  import tracker, { trackerId } from '@hcengineering/tracker'
  import { getCurrentLocation, IconAdd, location, navigate, showPopup } from '@hcengineering/ui'
  import { NavLink, TreeItem, TreeNode } from '@hcengineering/view-resources'
  import type { GroupsNavModel } from '@hcengineering/workbench'
  import { SpecialElement } from '@hcengineering/workbench-resources'
  import { groupWorkflows, isPageShown, workflowPagesProjectClass, type WorkflowPagesProject } from '../nav'
  import { isIssueId } from '../../issues'
  import { str, workflowIcon, WORKFLOW_APP_ALIAS } from '../plugin'
  import CreateWorkflowDialog from './CreateWorkflowDialog.svelte'

  export let model: GroupsNavModel
  export let currentSpace: Ref<Space> | undefined

  let projects: WorkflowPagesProject[] = []
  const projectQuery = createQuery()
  projectQuery.query(workflowPagesProjectClass, { members: getCurrentAccount().uuid, archived: false }, (found) => {
    projects = found
  })

  let departments: Department[] = []
  const departmentQuery = createQuery()
  departmentQuery.query(hr.class.Department, {}, (found) => {
    departments = found
  })

  let itemSpace: Ref<Space> | undefined
  const itemQuery = createQuery()
  $: itemId = $location.path[2] === trackerId && isIssueId($location.path[3]) ? $location.path[3] : undefined
  $: if (itemId === undefined) {
    itemQuery.unsubscribe()
    itemSpace = undefined
  } else {
    itemQuery.query(tracker.class.Issue, { identifier: itemId }, (found) => {
      itemSpace = found[0]?.space
    }, { limit: 1, projection: { space: 1 }, showArchived: true })
  }
  $: activeSpace = itemSpace ?? currentSpace

  $: groups = groupWorkflows(projects, departments)
  $: currentPage = itemSpace === undefined ? $location.path[4] : 'items'
  const canCreate = hasAccountRole(getCurrentAccount(), AccountRole.User)

  $: openDefault($location.path[3])
  function openDefault (target: string | undefined): void {
    const loc = getCurrentLocation()
    if (loc.path[2] !== WORKFLOW_APP_ALIAS) return
    if (target !== undefined && !isIssueId(target)) return
    loc.path = [loc.path[0], loc.path[1], WORKFLOW_APP_ALIAS, 'my-work']
    navigate(loc, true)
  }
</script>

{#each groups as group (group.department?._id ?? '')}
  <TreeNode
    _id={`workflows-${group.department?._id ?? 'none'}`}
    title={group.department?.name}
    label={group.department === undefined ? str.NoDepartment : undefined}
    highlighted={group.workflows.some((project) => project._id === activeSpace)}
    isFold
  >
    {#each group.workflows as project (project._id)}
      <TreeNode
        _id={project._id}
        title={project.name}
        icon={workflowIcon}
        type="nested"
        highlighted={project._id === activeSpace}
        visible={project._id === activeSpace && currentPage !== undefined}
      >
        {#each (model.specials ?? []).filter((page) => isPageShown(page.id, project)) as page (page.id)}
          <!-- Item pages live under tracker, so the app must be pinned or links resolve to /tracker/<space>/<page>. -->
          <NavLink app={WORKFLOW_APP_ALIAS} space={project._id} special={page.id}>
            <SpecialElement indent label={page.label} icon={page.icon} selected={project._id === activeSpace && currentPage === page.id} />
          </NavLink>
        {/each}
      </TreeNode>
    {/each}
  </TreeNode>
{/each}
{#if canCreate}
  <TreeItem _id="workflows-create" label={str.NewWorkflow} icon={IconAdd} on:click={() => showPopup(CreateWorkflowDialog, {}, 'top')} />
{/if}
