export const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded'

export interface CommandRequest {
  command: string
  text: string
  channelId: string
  channelName: string
  userId: string
  userName: string
  userEmail: string | undefined
  workspaceId: string
  responseUrl: string
  triggerId: string
}

// Slack's field names, so existing Slack slash command handlers read the body unchanged.
export function formBody (request: CommandRequest): string {
  return new URLSearchParams([
    ['command', `/${request.command}`],
    ['text', request.text],
    ['channel_id', request.channelId],
    ['channel_name', request.channelName],
    ['user_id', request.userId],
    ['user_name', request.userName],
    ['user_email', request.userEmail ?? ''],
    ['workspace_id', request.workspaceId],
    ['response_url', request.responseUrl],
    ['trigger_id', request.triggerId]
  ]).toString()
}
