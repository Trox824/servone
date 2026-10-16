import { getCurrentAccount } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import task from '@hcengineering/task'
import type { Project } from '@hcengineering/tracker'
import MyWork from './components/MyWork.svelte'
import WorkflowIssues from './components/WorkflowIssues.svelte'
import WorkflowNav from './components/WorkflowNav.svelte'
import WorkflowSettings from './components/WorkflowSettings.svelte'
import { isTrackerProject, isWorkflowType } from './nav'

export default async (): Promise<any> => ({
  component: { MyWork, WorkflowIssues, WorkflowNav, WorkflowSettings },
  function: {
    IsTrackerProject: async (project: Project) => isTrackerProject(project, getCurrentAccount().uuid),
    TrackerProjectsQuery: async () => {
      const types = getClient().getModel().findAllSync(task.class.ProjectType, {})
      return { type: { $nin: types.map((type) => type._id).filter(isWorkflowType) } }
    }
  }
})
