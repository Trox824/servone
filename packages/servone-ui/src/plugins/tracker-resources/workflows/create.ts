import type { Ref } from '@hcengineering/core'
import type { Department } from '@hcengineering/hr'
import type { IntlString } from '@hcengineering/platform'
import type { Project } from '@hcengineering/tracker'
import { isObject, type Json, malformed, serviceRequest } from '../../chunter-resources/webhooks/api'
import { str as onboardingStr } from './onboarding/strings'
import { str } from './plugin'

export const WORKFLOW_TEMPLATES = [
  { key: 'tuyen-dung', label: str.TemplateHiring, hint: str.TemplateHiringHint },
  { key: 'mua-hang', label: str.TemplatePurchase, hint: str.TemplatePurchaseHint },
  { key: 'hop-dong', label: str.TemplateContract, hint: str.TemplateContractHint },
  { key: 'it-helpdesk', label: str.TemplateHelpdesk, hint: str.TemplateHelpdeskHint },
  { key: 'nhan-viec', label: onboardingStr.TemplateOnboarding, hint: onboardingStr.TemplateOnboardingHint },
  { key: 'nghi-viec', label: onboardingStr.TemplateOffboarding, hint: onboardingStr.TemplateOffboardingHint },
  { key: 'trong', label: str.TemplateBlank, hint: str.TemplateBlankHint }
] as const

export type WorkflowTemplateKey = (typeof WORKFLOW_TEMPLATES)[number]['key']

export interface CreateWorkflowRequest {
  name: string
  department: Ref<Department>
  template: WorkflowTemplateKey
  language: 'vi' | 'en'
}

const ERROR_LABELS: Record<string, IntlString> = {
  invalid_name: str.ErrorName,
  unknown_department: str.ErrorDepartment,
  unknown_template: str.ErrorTemplate
}

export function createErrorLabel (code: string): IntlString {
  return ERROR_LABELS[code] ?? str.ErrorUnknown
}

export function parseCreatedWorkflow (reply: Json): Ref<Project> {
  if (!isObject(reply) || typeof reply.project !== 'string') throw malformed('workflow create reply')
  return reply.project as Ref<Project>
}

export async function createWorkflow (request: CreateWorkflowRequest): Promise<Ref<Project>> {
  return parseCreatedWorkflow(await serviceRequest('POST', '/workflows', request))
}
