import { type Ref, type Space } from '@hcengineering/core'
import { type ProjectType } from '@hcengineering/task'
import { typesOfQueriedSpaces } from './queriedSpaces'

const scrum = 'scrum' as Ref<ProjectType>
const approvals = 'approvals' as Ref<ProjectType>
const sprintProject = 'sprint-project' as Ref<Space>
const hiringProject = 'hiring-project' as Ref<Space>
const projects = [
  { _id: sprintProject, type: scrum },
  { _id: hiringProject, type: approvals }
]
const joinedTypes = [scrum, approvals]

describe('typesOfQueriedSpaces', () => {
  it('excludes the types of other projects when the query is one space', () => {
    expect(typesOfQueriedSpaces({ $in: [sprintProject] }, projects, joinedTypes)).toEqual([scrum])
    expect(typesOfQueriedSpaces(hiringProject, projects, joinedTypes)).toEqual([approvals])
  })

  it('keeps every queried project type once', () => {
    const second = { _id: 'second' as Ref<Space>, type: scrum }
    expect(typesOfQueriedSpaces({ $in: [sprintProject, second._id] }, [...projects, second], joinedTypes)).toEqual([scrum])
  })

  it('falls back to all joined types without a space or a match', () => {
    expect(typesOfQueriedSpaces(undefined, projects, joinedTypes)).toEqual(joinedTypes)
    expect(typesOfQueriedSpaces({ $in: ['unknown' as Ref<Space>] }, projects, joinedTypes)).toEqual(joinedTypes)
  })
})
