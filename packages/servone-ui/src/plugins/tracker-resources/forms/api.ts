import type { AccountUuid, Ref } from '@hcengineering/core'
import type { IssueTemplate } from '@hcengineering/tracker'
import { isObject, type Json, malformed, serviceRequest, webhooksServiceUrl } from '../../chunter-resources/webhooks/api'

export interface FormLink {
  url: string
  createdBy: AccountUuid
  createdOn: number
}

export function parseFormLink (json: Json): FormLink | undefined {
  if (!isObject(json)) throw malformed('response')
  const link = json.link
  if (link === null) return undefined
  if (!isObject(link) || typeof link.url !== 'string' || typeof link.createdBy !== 'string' || typeof link.createdOn !== 'number') {
    throw malformed('link')
  }
  return { url: link.url, createdBy: link.createdBy as AccountUuid, createdOn: link.createdOn }
}

export async function isFormLinkServiceConfigured (): Promise<boolean> {
  return (await webhooksServiceUrl()) !== undefined
}

const linkPath = (template: Ref<IssueTemplate>): string => `/forms/templates/${encodeURIComponent(template)}/link`

export async function readFormLink (template: Ref<IssueTemplate>): Promise<FormLink | undefined> {
  return parseFormLink(await serviceRequest('GET', linkPath(template)))
}

export async function createFormLink (template: Ref<IssueTemplate>): Promise<FormLink | undefined> {
  return parseFormLink(await serviceRequest('POST', linkPath(template)))
}

export async function deleteFormLink (template: Ref<IssueTemplate>): Promise<void> {
  await serviceRequest('DELETE', linkPath(template))
}
