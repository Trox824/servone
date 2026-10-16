import type { Project } from '@hcengineering/tracker'
import { issueAppPath } from '../links'

const project = (type: string): Pick<Project, 'type'> => ({ type: type as Project['type'] })

describe('issueAppPath', () => {
  it('opens a workflow project item in Quy trình', () => {
    expect(issueAppPath(project('servone:projectType:Workflow'))).toEqual(['approval', 'items'])
  })

  it('opens an item of a project-owned Workflow copy in Quy trình', () => {
    expect(issueAppPath(project('servone:projectType:Workflow:of:proj1'))).toEqual(['approval', 'items'])
  })

  it('leaves other projects to Tracker', () => {
    expect(issueAppPath(project('tracker:ids:ClassingProjectType'))).toBeUndefined()
  })
})
