import { ServiceApiError } from '../../../chunter-resources/webhooks/api'
import { createErrorLabel, parseCreatedWorkflow } from '../create'

jest.mock('@hcengineering/presentation', () => ({ __esModule: true, default: { metadata: { Token: 'token' } } }))

describe('create workflow reply', () => {
  it('reads the new project id', () => {
    expect(parseCreatedWorkflow({ project: 'p1' })).toBe('p1')
  })

  it('refuses a reply without a project', () => {
    expect(() => parseCreatedWorkflow({ isOk: true })).toThrow(ServiceApiError)
  })

  it('says which field the service refused', () => {
    expect(createErrorLabel('invalid_name')).toBe('servone-workflow:string:ErrorName')
    expect(createErrorLabel('unknown_department')).toBe('servone-workflow:string:ErrorDepartment')
    expect(createErrorLabel('unknown_template')).toBe('servone-workflow:string:ErrorTemplate')
    expect(createErrorLabel('rate_limited')).toBe('servone-workflow:string:ErrorUnknown')
  })
})
