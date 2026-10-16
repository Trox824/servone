import { type Ref, type Space } from '@hcengineering/core'
import { type ProjectType } from '@hcengineering/task'

interface ProjectOfType {
  _id: Ref<Space>
  type: Ref<ProjectType>
}

// Falls back to every joined type when the query has no space or matches no joined project.
export function typesOfQueriedSpaces (
  space: Ref<Space> | { $in?: Array<Ref<Space>> } | undefined,
  projects: ProjectOfType[],
  joinedTypes: Array<Ref<ProjectType>>
): Array<Ref<ProjectType>> {
  const spaceIds = typeof space === 'string' ? [space] : space?.$in
  if (spaceIds === undefined) return joinedTypes
  const queriedTypes = new Set(projects.filter((project) => spaceIds.includes(project._id)).map((project) => project.type))
  return queriedTypes.size > 0 ? [...queriedTypes] : joinedTypes
}
