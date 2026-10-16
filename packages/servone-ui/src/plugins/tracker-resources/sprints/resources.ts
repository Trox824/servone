import ActiveSprint from './components/ActiveSprint.svelte'
import Backlog from './components/Backlog.svelte'
import Epics from './components/Epics.svelte'
import SprintReport from './components/SprintReport.svelte'
import Triage from './components/Triage.svelte'
import Timeline from './components/Timeline.svelte'
import Releases from './components/Releases.svelte'
import Tabbed from './components/Tabbed.svelte'
import TimelineView from './components/TimelineView.svelte'
import CreateIssuePoints from './components/CreateIssuePoints.svelte'
import CreateIssueForm from '../forms/components/CreateIssueForm.svelte'
import Forms from '../forms/components/Forms.svelte'
import Insights from '../insights/components/InsightsPanel.svelte'
import ProjectWebhooks from '../webhooks/ProjectWebhooks.svelte'
import ProjectStatuses from '../settings/ProjectStatuses.svelte'
import ProjectCreateForm from '../settings/ProjectCreateForm.svelte'
import ProjectMembers from '../settings/ProjectMembers.svelte'
import ProjectHelpdesk from '../helpdesk/ProjectHelpdesk.svelte'
import { setNewIssuePoints } from './data'
import { isScrumProject } from './setup'
import { isWorkflowType } from '../workflows/nav'

export default async (): Promise<any> => ({
  component: {
    Backlog,
    ActiveSprint,
    Epics,
    SprintReport,
    Triage,
    Timeline,
    Releases,
    Tabbed,
    TimelineView,
    CreateIssuePoints,
    CreateIssueForm,
    Forms,
    Insights,
    ProjectWebhooks,
    ProjectStatuses,
    ProjectCreateForm,
    ProjectMembers,
    ProjectHelpdesk
  },
  function: {
    IsScrumProject: async (spaces: any[]) => spaces.every((s) => isScrumProject(s)),
    SetIssuePoints: setNewIssuePoints,
    IsWorkflowType: isWorkflowType
  }
})
