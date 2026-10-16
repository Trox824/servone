import type { Class, Doc, Ref } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import { getClient } from '@hcengineering/presentation'
import { showPopup, type AnyComponent } from '@hcengineering/ui'
import { openDoc } from '@hcengineering/view-resources'

export interface EmptyAction {
  label: IntlString
  run: () => void
}

export const emptyCopy = {
  projects: 'ui:string:ServoneEmptyProjects' as IntlString,
  projectsAction: 'ui:string:ServoneEmptyProjectsAction' as IntlString,
  sprints: 'ui:string:ServoneEmptySprints' as IntlString,
  sprintsAction: 'ui:string:ServoneEmptySprintsAction' as IntlString,
  chat: 'ui:string:ServoneEmptyChat' as IntlString,
  chatAction: 'ui:string:ServoneEmptyChatAction' as IntlString,
  docs: 'ui:string:ServoneEmptyDocs' as IntlString,
  docsAction: 'ui:string:ServoneEmptyDocsAction' as IntlString,
  drive: 'ui:string:ServoneEmptyDrive' as IntlString,
  driveAction: 'ui:string:ServoneEmptyDriveAction' as IntlString,
  calendar: 'ui:string:ServoneEmptyCalendar' as IntlString,
  calendarAction: 'ui:string:ServoneEmptyCalendarAction' as IntlString,
  meetings: 'ui:string:ServoneEmptyMeetings' as IntlString,
  meetingsAction: 'ui:string:ServoneEmptyMeetingsAction' as IntlString,
  workflow: 'ui:string:ServoneEmptyWorkflow' as IntlString,
  workflowAction: 'ui:string:ServoneEmptyWorkflowAction' as IntlString,
  people: 'ui:string:ServoneEmptyPeople' as IntlString,
  peopleInvite: 'ui:string:ServoneEmptyPeopleInvite' as IntlString,
  peopleImport: 'ui:string:ServoneEmptyPeopleImport' as IntlString
}

const DOCUMENT_CLASS = 'document:class:Document' as Ref<Class<Doc>>

export function newDocument (): void {
  showPopup('document:component:CreateDocument' as AnyComponent, {}, 'top', async (id) => {
    if (id === undefined || id === null) return
    const client = getClient()
    const created = await client.findOne(DOCUMENT_CLASS, { _id: id })
    if (created !== undefined) void openDoc(client.getHierarchy(), created)
  })
}
