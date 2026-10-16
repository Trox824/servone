import type { Client } from '@hcengineering/core'
import workbench from '@hcengineering/workbench'
import { serviceRequest, ServiceApiError } from '../../chunter-resources/webhooks/api'
import { getCurrentLocation, navigate } from '@hcengineering/ui'
import { LEGACY_WORKFLOW_APP_ALIAS, WORKFLOW_APP_ALIAS } from './plugin'

let hasTried = false

function redirectLegacyWorkflowPath (): void {
  const location = getCurrentLocation()
  if (location.path[2] !== LEGACY_WORKFLOW_APP_ALIAS) return
  location.path[2] = WORKFLOW_APP_ALIAS
  navigate(location, true)
}

export async function ensureWorkflowApp (client: Client): Promise<void> {
  redirectLegacyWorkflowPath()
  if (hasTried) return
  if (client.getModel().findAllSync(workbench.class.Application, { alias: WORKFLOW_APP_ALIAS }).length > 0) return
  try {
    await serviceRequest('POST', '/workflows/setup')
    hasTried = true
  } catch (error) {
    if (error instanceof ServiceApiError && error.code === 'not_configured') {
      hasTried = true
      return
    }
    throw error
  }
}
