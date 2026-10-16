import { getMetadata } from '@hcengineering/platform'
import presentation from '@hcengineering/presentation'
import { servoneServiceUrl } from '../../plugins/chunter-resources/webhooks/api'

export async function recordInvites (emails: string[]): Promise<void> {
  if (emails.length === 0) return
  const base = await servoneServiceUrl('SERVONE_MCP_URL')
  if (base === undefined) return
  const response = await fetch(`${base}/v1/lifecycle/invites`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getMetadata(presentation.metadata.Token) ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails })
  })
  if (!response.ok) throw new Error(`Invite record answered ${response.status}`)
}
